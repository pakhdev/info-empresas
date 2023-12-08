import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Raw, Repository } from 'typeorm';

import { ActivityCode } from 'src/activity-codes/entities/activity-code.entity';
import { Company } from './entities/company.entity';
import { ImportCompany } from '../postal-codes/dto/import-companies.dto';
import { PostalCode } from 'src/postal-codes/entities/postal-code.entity';
import { CompanyInMemory } from './interfaces/company-in-memory.interface';
import { PostalCodeInMemory } from '../postal-codes/interfaces/postal-code-in-memory.interface';

@Injectable()
export class CompaniesService implements OnModuleInit {
    constructor(@InjectRepository(Company) private readonly companiesRepository: Repository<Company>) {}

    private dbCompanies: CompanyInMemory[] = [];
    private dbUnprocessedCompanies: CompanyInMemory[] = [];
    private dbUnprocessedCompaniesWithCif: CompanyInMemory[] = [];
    private insertOrUpdateQueue = [];

    async onModuleInit(): Promise<void> {
        this.dbCompanies = await this.getAll();
        this.dbUnprocessedCompanies = await this.getAllPending();
        this.dbUnprocessedCompaniesWithCif = await this.getAllPendingWithCif();
        await this.deferredDBWrite();
    }

    public getOnePending(): CompanyInMemory {
        return this.dbUnprocessedCompanies.pop();
    }

    public getOnePendingWithCif(): CompanyInMemory {
        return this.dbUnprocessedCompaniesWithCif.pop();
    }

    public async importCompanies(insertCompanies: ImportCompany[], postalCode: PostalCodeInMemory, activityCode: ActivityCode) {
        const companiesToCreateOrUpdate: Company[] = [];

        for (const insertCompany of insertCompanies) {
            const { name, camara_link } = insertCompany;
            if (
                !this.isInRam(name, postalCode.code) &&
                !companiesToCreateOrUpdate.find(oneCompany => oneCompany.name === insertCompany.name)
            ) {
                // Create company
                const createCompany = this.companiesRepository.create({
                    name,
                    postal_code: postalCode,
                    activity_codes: [activityCode],
                    camara_link,
                });
                companiesToCreateOrUpdate.push(createCompany);
                this.dbCompanies.push({ name, postal_code: postalCode.code, activity_codes: [activityCode] });
            } else {
                const companyInRam = this.dbCompanies.find(company => company.name === name && company.postal_code === postalCode.code);
                const companyHasActivity = companyInRam.activity_codes.some(activity => activity.code === activityCode.code);
                if (!companyHasActivity) {
                    companyInRam.activity_codes.push(activityCode);
                    const companyInDB = await this.companiesRepository.findOneBy({
                        name,
                        postal_code: { id: postalCode.id },
                    });
                    companyInDB.activity_codes = companyInRam.activity_codes;
                    companiesToCreateOrUpdate.push(companyInDB);
                }
            }
        }
        if (companiesToCreateOrUpdate.length)
            this.insertOrUpdateQueue.push(companiesToCreateOrUpdate);
        return true;
    }

    public async setInfoId(id: number, information_id: string): Promise<'ok'> {
        const company = await this.companiesRepository.findOneBy({ id });
        if (!company) throw new NotFoundException();
        company.information_id = information_id;
        await this.companiesRepository.save(company);
        return 'ok';
    }

    public async setCifChecked(id: number): Promise<'ok'> {
        const company = await this.companiesRepository.findOneBy({ id });
        if (!company) throw new NotFoundException();
        company.cif = 'CHECKED';
        await this.companiesRepository.save(company);
        return 'ok';
    }

    private async deferredDBWrite() {
        const queueTask = this.insertOrUpdateQueue.shift();
        if (queueTask) {
            try {
                await this.companiesRepository.save(queueTask);
            } catch (err) {
                console.log('Error saving companies', err);
            }
            await this.deferredDBWrite();
        } else {
            setTimeout(() => this.deferredDBWrite(), 500);
        }
    }

    private async getAll(): Promise<CompanyInMemory[]> {
        const companies = await this.companiesRepository.find({
            relations: ['postal_code', 'activity_codes'],
        });
        console.log(`${ this.dbCompanies.length } companies loaded into memory`);
        return companies.map(company => ({
            name: company.name,
            postal_code: company.postal_code.code,
            activity_codes: company.activity_codes,
        }));
    }

    private async getAllPending(): Promise<CompanyInMemory[]> {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const companies = await this.companiesRepository.find({
            where: [
                {
                    information_id: IsNull(),
                    lastRetrieveData: LessThan(tenMinutesAgo),
                },
                {
                    information_id: IsNull(),
                    lastRetrieveData: IsNull(),
                },
            ],
            relations: ['postal_code', 'activity_codes'],
        });
        console.log(`${ this.dbUnprocessedCompanies.length } unprocessed companies loaded into memory`);
        return companies.map(company => ({
            id: company.id,
            name: company.name,
            postal_code: company.postal_code.code,
            activity_code: company.activity_codes.length ? company.activity_codes[0].code : '',
            camara_link: company.camara_link,
        }));
    }

    private async getAllPendingWithCif(): Promise<CompanyInMemory[]> {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const companies = await this.companiesRepository.find({
            where: [
                {
                    cif: Raw('cif IS NOT NULL AND cif NOT IN (\'NOCIF\', \'NOTEXIST\', \'CHECKED\')'),
                    lastRetrieveData: LessThan(tenMinutesAgo),
                },
                {
                    cif: Raw('cif IS NOT NULL AND cif NOT IN (\'NOCIF\', \'NOTEXIST\', \'CHECKED\')'),
                    lastRetrieveData: IsNull(),
                },
            ],
            relations: ['postal_code', 'activity_codes'],
        });
        console.log(`${ this.dbUnprocessedCompaniesWithCif.length } unprocessed companies with cif loaded into memory`);
        return companies.map(company => ({
            id: company.id,
            name: company.name,
            cif: company.cif.trim(),
            postal_code: company.postal_code.code,
            activity_code: company.activity_codes.length ? company.activity_codes[0].code : '',
            camara_link: company.camara_link,
        }));
    }

    private isInRam(name: string, postalCode: string): boolean {
        return this.dbCompanies.some(company => company.name === name && company.postal_code === postalCode);
    }

}
