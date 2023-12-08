import { Repository } from 'typeorm';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';

import { ActivityCode } from 'src/activity-codes/entities/activity-code.entity';
import { ActivityCodesService } from 'src/activity-codes/activity-codes.service';
import { CompaniesService } from 'src/companies/companies.service';
import { ImportCompaniesDto } from './dto/import-companies.dto';
import { PostalCode } from './entities/postal-code.entity';
import { PostalCodeCompaniesLoadingEnum } from './enums/postal-code-companies-loading.enum';
import { PostalCodeDifficultActivityCode } from './entities/postal-code-difficult-activity-code.entity';
import { StreetsSearchHelper } from './helpers/streets-search.helper';
import { StreetsService } from 'src/streets/streets.service';
import { Task } from './interfaces/task.interface';
import { PostalCodeInMemory } from './interfaces/postal-code-in-memory.interface';

@Injectable()
export class PostalCodesService implements OnModuleInit {
    constructor(
        @InjectRepository(PostalCode) private readonly postalCodeRepository: Repository<PostalCode>,
        @InjectRepository(PostalCodeDifficultActivityCode) private readonly postalCodeDifficultActivityCodeRepository: Repository<PostalCodeDifficultActivityCode>,
        private readonly streetsService: StreetsService,
        private readonly activityCodesService: ActivityCodesService,
        private readonly companiesService: CompaniesService,
    ) {}

    private dbPostalCodes: PostalCodeInMemory[] = [];
    private difficultiesQueue = [];

    async onModuleInit(): Promise<void> {
        await this.preload();
        await this.difficultiesProcessor();
    }

    public async findMissingPostalCodes(): Promise<string[]> {
        const maxPostalCode = 53000;
        const existingPostalCodes: number[] = this.dbPostalCodes.map(postalCode => +postalCode.code).filter(Boolean);
        const missingPostalCodes: string[] = [];
        for (let currentPostalCode = 1; currentPostalCode <= maxPostalCode; currentPostalCode++) {
            if (!existingPostalCodes.includes(currentPostalCode)) {
                missingPostalCodes.push(currentPostalCode.toString().padStart(5, '0'));
            }
        }
        return missingPostalCodes;
    }

    public async getTasks(): Promise<Task[]> {
        const postalCode = this.getOnePending();
        const easyTasks = this.prepareEasyTasks(postalCode);
        const difficultTasks = this.prepareDifficultTasks(postalCode);
        const workQueue = easyTasks.concat(difficultTasks);
        if (!workQueue.length) {
            await this.managePostalCodeState(postalCode, false);
            return this.getTasks();
        }
        await this.markAsStarted(postalCode);
        return workQueue;
    }

    public async insertCompanies(importCompaniesDto: ImportCompaniesDto): Promise<'ok'> {

        const postalCode = this.getOneByCode(importCompaniesDto.postal_code);
        const activityCode = this.activityCodesService.findOne(importCompaniesDto.activity_code);
        if (!postalCode || !activityCode) return;
        const difficulty = this.getDifficulty(postalCode, activityCode, importCompaniesDto.search_text);
        // TODO: Always mark finished?
        let markFinished = true;

        if (importCompaniesDto.companies.length === 50) {
            switch (difficulty) {
                case 0:
                    this.insertToDifficultiesQueue(postalCode, activityCode, importCompaniesDto.search_text);
                    break;
                case 1:
                    this.insertToDifficultiesQueue(postalCode, activityCode, importCompaniesDto.search_text, true);
                    break;
                case 2:
                    await axios.get(`https://api.telegram.org/bot5367037986:AAEiPHLbFJlg0uhM2nWkRsheSpX-_wtnzlg/sendMessage?chat_id=-1001535964550&disable_web_page_preview=True&parse_mode=markdown&text=${ importCompaniesDto.postal_code }/${ importCompaniesDto.search_text }`);
                    break;
            }
            markFinished = false;
        }

        const importedCompanies = await this.companiesService.importCompanies(importCompaniesDto.companies, postalCode, activityCode);
        if (importCompaniesDto.companies.length === 0 || importedCompanies) {
            difficulty > 0
                ? await this.markFinishedDifficultActivity(postalCode, activityCode, importCompaniesDto.search_text)
                : await this.markFinishedActivity(postalCode, activityCode);
        }
        return 'ok';
    }

    public async spawnStreetNumberTasks(postalCodeNumber: string, streetName: string, minNumber: string, maxNumber: string): Promise<'ok' | string> {
        const postalCode = this.getOneByCode(postalCodeNumber);
        const activityCodes = this.activityCodesService.findAll();

        if (!postalCode) throw new NotFoundException(`Postal code ${ postalCodeNumber } not found`);
        if (!activityCodes) return 'No activity codes were found in the database';
        if (!/^\d+$/.test(minNumber)) return 'Incorrect min number';
        if (!/^\d+$/.test(maxNumber)) return 'Incorrect max number';

        streetName = streetName
            .replace(/[^A-ZÑÁÉÍÓÚ\s]/gi, ' ')
            .replace(/ {2,}/g, ' ')
            .trim()
            .toUpperCase();

        if (streetName === '') return 'Incorrect street name';

        const tasksToInsert = [];
        for (const activityCode of activityCodes) {
            if (!postalCode.finished.some(activity => activity.code === activityCode.code)) {
                postalCode.finished.push(activityCode);
            }
            for (let i = +minNumber; i <= +maxNumber; i++) {
                let number = i.toString();
                number = number.padStart(5, '0');
                const task = this.postalCodeDifficultActivityCodeRepository.create({
                    searchText: `${ streetName } ${ number }`,
                    postalCode: { id: postalCode.id },
                    activityCode: { id: activityCode.id },
                    difficulty: 2,
                });
                tasksToInsert.push(task);
            }
        }
        const insertedTasks = await this.postalCodeDifficultActivityCodeRepository.save(tasksToInsert);
        postalCode.difficult = postalCode.difficult.concat(insertedTasks);

        if (postalCode.state === PostalCodeCompaniesLoadingEnum.FINISHED) {
            postalCode.state = PostalCodeCompaniesLoadingEnum.STARTED;
        }
        postalCode.touchTime = null;

        const PCinDB = await this.postalCodeRepository.findOneBy({ id: postalCode.id });
        PCinDB.companiesLoadingState = postalCode.state;
        PCinDB.lastCompaniesAttemptDate = null;
        PCinDB.finished_activity_codes = postalCode.finished;

        await this.postalCodeRepository.save(PCinDB);
        return 'ok';
    }

    private async preload(): Promise<void> {
        const allPostalCodes = await this.postalCodeRepository.find({
            relations: ['finished_activity_codes', 'difficult_activity_codes', 'difficult_activity_codes.activityCode'],
        });
        for (const postalCode of allPostalCodes) {
            this.dbPostalCodes[+postalCode.code] = {
                id: postalCode.id,
                code: postalCode.code,
                finished: postalCode.finished_activity_codes,
                difficult: postalCode.difficult_activity_codes,
                touchTime: postalCode.lastCompaniesAttemptDate,
                state: postalCode.companiesLoadingState,
            };
        }
        console.log(`Postal codes loaded into memory`);
    }

    private async difficultiesProcessor(): Promise<void> {
        const queueTask = this.difficultiesQueue.shift();
        if (queueTask && queueTask.genStreets) {
            await this.insertStreetTasks(queueTask.postalCode, queueTask.activityCode, queueTask.searchText);
            await this.difficultiesProcessor();
        } else if (queueTask) {
            await this.insertDifficultTasks(queueTask.postalCode, queueTask.activityCode, queueTask.searchText);
            await this.difficultiesProcessor();
        } else {
            setTimeout(() => this.difficultiesProcessor(), 500);
        }
    }

    private getOnePending(): PostalCodeInMemory {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const postalCode = this.dbPostalCodes.find(onePostal =>
            onePostal !== undefined && onePostal !== null &&
            (
                (onePostal.state === PostalCodeCompaniesLoadingEnum.NOTSTARTED && onePostal.touchTime === null) ||
                (onePostal.state === PostalCodeCompaniesLoadingEnum.STARTED && onePostal.touchTime < tenMinutesAgo) ||
                (onePostal.state === PostalCodeCompaniesLoadingEnum.STARTED && onePostal.touchTime === null)
            ),
        );
        if (!postalCode) {
            console.log('No pending postal codes');
            return null;
        }
        return postalCode;
    }

    private getOneByCode(code: string): PostalCodeInMemory {
        const postalCode = this.dbPostalCodes.find(onePostal =>
            onePostal !== undefined && onePostal !== null && onePostal.code === code,
        );
        if (!postalCode) {
            console.log(`Postal code ${ code } not found`);
            return null;
        }
        return postalCode;
    }

    private getRemainingActivityCodes(postalCode: PostalCodeInMemory): ActivityCode[] {
        const activityCodes = this.activityCodesService.findAll();
        if (!activityCodes) {
            console.log('No activity codes were found in the database');
            return null;
        }
        return activityCodes.filter((activity) => {
            return !postalCode.finished.some((finished) => finished.code === activity.code);
        });
    }

    private prepareEasyTasks(postalCode: PostalCodeInMemory): Task[] {
        return this.getRemainingActivityCodes(postalCode).map(activityCode => ({
            postalCode: postalCode.code,
            activityCode: activityCode.code,
            searchText: '',
            difficulty: 0,
        }));
    }

    private prepareDifficultTasks(postalCode: PostalCodeInMemory): Task[] {
        const difficultTasks: Task[] = postalCode.difficult.map((difficultTask: PostalCodeDifficultActivityCode) =>
            ({
                postalCode: postalCode.code,
                activityCode: difficultTask.activityCode.code,
                // searchText: difficultTask.searchText.replace(/[^A-ZÑÁÉÍÓÚ\s]/gi, " ").replace(/ {2,}/g, " "),
                searchText: difficultTask.searchText,
                difficulty: difficultTask.difficulty,
            }));
        const findEmpty = difficultTasks.some((one: Task) => one.searchText.trim() === '');
        if (findEmpty) console.log('Found empty difficult code', findEmpty);
        return difficultTasks;
    }

    private getDifficulty(postalCode: PostalCodeInMemory, activityCode: ActivityCode, searchText: string): number {
        const findDifficult = postalCode.difficult.find(difficult => difficult.activityCode.code === activityCode.code && difficult.searchText === searchText);
        if (findDifficult) return findDifficult.difficulty;
        return 0;
    }

    private insertToDifficultiesQueue(postalCode: PostalCodeInMemory, activityCode: ActivityCode, searchText: string, genStreets: boolean = false): void {
        this.difficultiesQueue.push({ postalCode, activityCode, searchText, genStreets });
    }

    private async markAsStarted(postalCode: PostalCodeInMemory): Promise<void> {
        postalCode.touchTime = new Date();
        postalCode.state = PostalCodeCompaniesLoadingEnum.STARTED;
        const PCinDB = await this.postalCodeRepository.findOneBy({ id: postalCode.id });
        PCinDB.lastCompaniesAttemptDate = new Date();
        PCinDB.companiesLoadingState = PostalCodeCompaniesLoadingEnum.STARTED;
        await this.postalCodeRepository.save(PCinDB);
    }

    private async markAsFinished(postalCode: PostalCodeInMemory): Promise<void> {
        const PCinDB = await this.postalCodeRepository.findOneBy({ id: postalCode.id });
        postalCode.state = PostalCodeCompaniesLoadingEnum.FINISHED;
        PCinDB.companiesLoadingState = PostalCodeCompaniesLoadingEnum.FINISHED;
        PCinDB.finished_activity_codes = [];
        await this.postalCodeRepository.save(PCinDB);
    }

    private async markFinishedActivity(postalCode: PostalCodeInMemory, activityCode: ActivityCode): Promise<void> {
        const isAlreadyFinished = postalCode.finished.some(activity => activity.code === activityCode.code);
        if (!isAlreadyFinished) {
            postalCode.finished.push(activityCode);
            const PCinDB = await this.postalCodeRepository.findOneBy({ id: postalCode.id });
            PCinDB.finished_activity_codes = postalCode.finished;
            await this.postalCodeRepository.save(PCinDB);
        }
        await this.managePostalCodeState(postalCode, false);
    }

    private async markFinishedDifficultActivity(postalCode: PostalCodeInMemory, activityCode: ActivityCode, searchText: string): Promise<void> {
        const activityToRemove = postalCode.difficult.find(
            activity => activity.activityCode.code === activityCode.code && activity.searchText === searchText,
        );
        if (!activityToRemove) return;
        try {
            await this.postalCodeDifficultActivityCodeRepository.remove(activityToRemove);
        } catch (err) {
            console.log('Error removing difficult activity', err);
        }
        postalCode.difficult = postalCode.difficult.filter(activity =>
            !(activity.activityCode.code === activityCode.code && activity.searchText === searchText),
        );
        await this.managePostalCodeState(postalCode, true);
    }

    private async resetAttemptDate(postalCode: PostalCodeInMemory): Promise<void> {
        const PCinDB = await this.postalCodeRepository.findOneBy({ id: postalCode.id });
        postalCode.touchTime = null;
        PCinDB.lastCompaniesAttemptDate = null;
        await this.postalCodeRepository.save(PCinDB);
    }

    private async managePostalCodeState(postalCode: PostalCodeInMemory, finishedDifficult: boolean): Promise<void> {
        const remainingCodes = this.getRemainingActivityCodes(postalCode);
        const pendingDifficultiesProcessing = this.difficultiesQueue.some(difficulty => difficulty.postalCode.code === postalCode.code);
        if (!remainingCodes.length
            && !postalCode.difficult.length
            && !pendingDifficultiesProcessing
            && !this.difficultiesQueue.some(difficulty => difficulty.postalCode.id === postalCode.id)) {
            await this.markAsFinished(postalCode);
        } else if (!finishedDifficult
            && !remainingCodes.length
            && postalCode.difficult.length) {
            await this.resetAttemptDate(postalCode);
        }
    }

    private async insertDifficultTasks(postalCode: PostalCodeInMemory, activityCode: ActivityCode, reqText: string): Promise<void> {
        const allStreets = this.streetsService.findByPostalCode(postalCode.code);
        const streetsSearchHelper = new StreetsSearchHelper(allStreets);
        let percent = 30;
        const { validLetters, frequentLetters } = streetsSearchHelper.findValidLetters(percent);
        const validLettersWithTwo = streetsSearchHelper.findTwoLetters(
            validLetters,
            frequentLetters,
            percent,
        );

        let searchTexts: string[] = streetsSearchHelper.findBestCombinations(validLettersWithTwo);
        if (!Array.isArray(searchTexts)) return;

        for (const searchText of searchTexts) {
            if (searchText === reqText) continue;
            const oneDifficultInsert = this.postalCodeDifficultActivityCodeRepository.create({
                searchText, postalCode: { id: postalCode.id }, activityCode, difficulty: 1,
            });
            try {
                const addedCode = await this.postalCodeDifficultActivityCodeRepository.save(oneDifficultInsert);
                if (addedCode) postalCode.difficult.push(addedCode);
            } catch (err) {
                console.log('Error inserting difficult activities', err);
            }
        }
    }

    private async insertStreetTasks(postalCode: PostalCodeInMemory, activityCode: ActivityCode, difficultCombination: string): Promise<void> {
        const streets = this.streetsService.findByLetters(postalCode.code, difficultCombination);
        for (let street of streets) {
            if (street === difficultCombination) continue;
            if (street.trim().length < 2) continue;
            const insertStreet = this.postalCodeDifficultActivityCodeRepository.create({
                searchText: street, postalCode: { id: postalCode.id }, activityCode, difficulty: 2,
            });
            try {
                const addedCode = await this.postalCodeDifficultActivityCodeRepository.save(insertStreet);
                if (addedCode) postalCode.difficult.push(addedCode);
            } catch (err) {
                console.log('Error inserting difficult activities with streets', err);
            }
        }
    }

    async testBB() { // addStreetsToParsing
        const postalCode = this.dbPostalCodes.find(onePostal =>
            onePostal !== undefined && onePostal !== null && onePostal.id === 1877,
        );
        const activityCode = this.activityCodesService.findOne('5011');
        const startTime = new Date();
        // const addedStreets = await this.addStreetsToParsing(postalCode, activityCode, 'G');
    }

    async testAA() { // markDifficultActivity
        // const postalCode = this.dbPostalCodes.find(onePostal =>
        //   onePostal !== undefined && onePostal !== null && onePostal.id === 5647
        // );

        // const activityCode = this.activityCodesService.findOne('5011');
        // const startTime = new Date();
        // await this.markDifficultActivity(postalCode, activityCode);
        // console.log(postalCode.difficult);
    }

    async testCC() { // markFinishedDifficultActivity
        const postalCode = this.dbPostalCodes.find(onePostal =>
            onePostal !== undefined && onePostal !== null && onePostal.id === 5647,
        );
        const activityCode = this.activityCodesService.findOne('5011');
        await this.markFinishedDifficultActivity(postalCode, activityCode, 'ALAVA');
        console.log(postalCode);
    }

    async testDD() { // markFinishedActivity
        const postalCode = this.dbPostalCodes.find(onePostal =>
            onePostal !== undefined && onePostal !== null && onePostal.id === 1877,
        );
        const activityCode = this.activityCodesService.findOne('5021');
        await this.markFinishedActivity(postalCode, activityCode);
        console.log(postalCode);
    }

    testEE() { // insertToDifficultiesQueue
        // const postalCode = this.dbPostalCodes.find(onePostal =>
        //   onePostal !== undefined && onePostal !== null && onePostal.id === 1877
        // );
        // const activityCode = this.activityCodesService.findOne('5021');
        // this.insertToDifficultiesQueue(postalCode, activityCode);
        // this.insertToDifficultiesQueue(postalCode, activityCode, 'testText');
    }

}
