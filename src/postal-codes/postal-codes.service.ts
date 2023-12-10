import { Repository } from 'typeorm';
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
        if (!postalCode) throw new NotFoundException('No pending postal codes');
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
        if (!postalCode || !activityCode) {
            console.log(`insertCompanies()->Postal code ${ importCompaniesDto.postal_code } or activity code ${ importCompaniesDto.activity_code } not found`);
            return;
        }
        const difficulty = this.getDifficulty(postalCode, activityCode, importCompaniesDto.search_text);

        if (importCompaniesDto.companies.length === 50) {
            switch (difficulty) {
                case 0:
                    this.insertToDifficultiesQueue(postalCode, activityCode, importCompaniesDto.search_text);
                    break;
                case 1:
                    this.insertToDifficultiesQueue(postalCode, activityCode, importCompaniesDto.search_text, true);
                    break;
                case 2:
                    console.log(`Attention! Inserted 50 companies from ${ importCompaniesDto.search_text } (C.P. ${ importCompaniesDto.postal_code }) with difficulty 2`);
                    break;
            }
        }

        const importedCompanies = await this.companiesService.importCompanies(importCompaniesDto.companies, postalCode, activityCode);
        if (importCompaniesDto.companies.length === 0 || importedCompanies) {
            difficulty > 0
                ? await this.markFinishedDifficultActivity(postalCode, activityCode, importCompaniesDto.search_text)
                : await this.markFinishedActivity(postalCode, activityCode);
        }
        return 'ok';
    }

    public async spawnStreetNumberTasks(postalCodeNumber: string, streetName: string, minNumber: string, maxNumber: string): Promise<'ok'> {
        const postalCode = this.getOneByCode(postalCodeNumber);
        const activityCodes = this.activityCodesService.findAll();

        if (!postalCode) throw new NotFoundException(`Postal code ${ postalCodeNumber } not found`);
        if (!activityCodes) throw new NotFoundException('No activity codes were found in the database');
        if (!/^\d+$/.test(minNumber)) throw new NotFoundException('Incorrect min number');
        if (!/^\d+$/.test(maxNumber)) throw new NotFoundException('Incorrect max number');

        streetName = streetName
            .replace(/[^A-ZÑÁÉÍÓÚ\s]/gi, ' ')
            .replace(/ {2,}/g, ' ')
            .trim()
            .toUpperCase();

        if (streetName === '') throw new NotFoundException('Street name is empty');

        const tasksToInsert: PostalCodeDifficultActivityCode[] = activityCodes.flatMap(activityCode =>
            Array.from({ length: +maxNumber - +minNumber + 1 }, (_, index) => {
                const number = (index + +minNumber).toString().padStart(5, '0');
                return this.postalCodeDifficultActivityCodeRepository.create({
                    searchText: `${ streetName } ${ number }`,
                    postalCode: { id: postalCode.id },
                    activityCode: { id: activityCode.id },
                    difficulty: 2,
                });
            }),
        );

        await this.disableTasksWithoutSearchText(postalCode, activityCodes);
        await this.assignDifficultActivities(postalCode, tasksToInsert);
        await this.resetAttemptDate(postalCode);
        return 'ok';
    }

    public async spawnKeywordTasks(postalCodeNumber: string, keyword: string): Promise<'ok'> {
        const postalCode = this.getOneByCode(postalCodeNumber);
        const activityCodes = this.activityCodesService.findAll();

        if (!postalCode) throw new NotFoundException(`Postal code ${ postalCodeNumber } not found`);
        if (!activityCodes) throw new NotFoundException('No activity codes were found in the database');
        if (keyword === '') throw new NotFoundException('Keyword is empty');

        keyword = keyword
            .replace(/[^A-ZÑÁÉÍÓÚ\s]/gi, ' ')
            .replace(/ {2,}/g, ' ')
            .trim()
            .toUpperCase();

        const tasksToInsert: PostalCodeDifficultActivityCode[] = activityCodes.map(activityCode =>
            this.postalCodeDifficultActivityCodeRepository.create({
                searchText: keyword,
                postalCode: { id: postalCode.id },
                activityCode: { id: activityCode.id },
                difficulty: 2,
            }),
        );

        await this.disableTasksWithoutSearchText(postalCode, activityCodes);
        await this.assignDifficultActivities(postalCode, tasksToInsert);
        await this.resetAttemptDate(postalCode);
        return 'ok';
    }

    private async spawnLetterSequenceTasks(postalCode: PostalCodeInMemory, activityCode: ActivityCode, reqText: string): Promise<void> {
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

        const tasksToInsert = searchTexts
            .filter(searchText => searchText !== reqText)
            .map(searchText => this.postalCodeDifficultActivityCodeRepository.create({
                searchText,
                postalCode: { id: postalCode.id },
                activityCode,
                difficulty: 1,
            }));
        await this.assignDifficultActivities(postalCode, tasksToInsert);
    }

    private async spawnStreetTasks(postalCode: PostalCodeInMemory, activityCode: ActivityCode, difficultCombination: string): Promise<void> {
        const streets = this.streetsService.findByLetters(postalCode.code, difficultCombination);
        const tasksToInsert: PostalCodeDifficultActivityCode[] = streets
            .filter(street => street !== difficultCombination && street.trim().length >= 2)
            .map(street => this.postalCodeDifficultActivityCodeRepository.create({
                searchText: street,
                postalCode: { id: postalCode.id },
                activityCode,
                difficulty: 2,
            }));
        await this.assignDifficultActivities(postalCode, tasksToInsert);
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
            await this.spawnStreetTasks(queueTask.postalCode, queueTask.activityCode, queueTask.searchText);
            await this.difficultiesProcessor();
        } else if (queueTask) {
            await this.spawnLetterSequenceTasks(queueTask.postalCode, queueTask.activityCode, queueTask.searchText);
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
        if (postalCode.state === PostalCodeCompaniesLoadingEnum.FINISHED)
            postalCode.state = PostalCodeCompaniesLoadingEnum.STARTED;

        postalCode.touchTime = null;
        const PCinDB = await this.postalCodeRepository.findOneBy({ id: postalCode.id });
        PCinDB.lastCompaniesAttemptDate = null;
        PCinDB.companiesLoadingState = postalCode.state;
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

    private async assignDifficultActivities(postalCode: PostalCodeInMemory, difficultActivities: PostalCodeDifficultActivityCode[]): Promise<void> {
        const filteredDifficultActivities = difficultActivities.filter(activity => {
            return !postalCode.difficult.some(item => item.searchText === activity.searchText);
        });
        if (!filteredDifficultActivities.length) return;
        try {
            await this.postalCodeDifficultActivityCodeRepository.save(filteredDifficultActivities);
            postalCode.difficult = postalCode.difficult.concat(filteredDifficultActivities);
        } catch (err) {
            console.log('Error assigning difficult activities', err);
        }
    }

    private async disableTasksWithoutSearchText(postalCode: PostalCodeInMemory, activityCodes: ActivityCode[]): Promise<void> {
        const newFinishedActivities = activityCodes.filter(activityCode =>
            !postalCode.finished.some(finished => finished.code === activityCode.code),
        );
        postalCode.finished.push(...newFinishedActivities);

        const PCinDB = await this.postalCodeRepository.findOneBy({ id: postalCode.id });
        PCinDB.finished_activity_codes = postalCode.finished;
        await this.postalCodeRepository.save(PCinDB);
    }

}
