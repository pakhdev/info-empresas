import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Street } from './entities/streets.entity';

@Injectable()
export class StreetsService implements OnModuleInit {

    private dbStreets: { [postalCode: number]: string[] } = {};

    constructor(@InjectRepository(Street) private readonly streetsRepository: Repository<Street>) {}

    async onModuleInit(): Promise<void> {
        const allStreets: Street[] = await this.streetsRepository.find({ relations: ['postal_code'] });
        for (const street of allStreets) {
            if (this.dbStreets[street.postal_code.code]) {
                this.dbStreets[street.postal_code.code].push(street.name.replace(/[^A-ZÑÁÉÍÓÚ\s]/gi, ' ').replace(/ {2,}/g, ' ').trim());
            } else {
                this.dbStreets[street.postal_code.code] = [street.name.replace(/[^A-ZÑÁÉÍÓÚ\s]/gi, ' ').replace(/ {2,}/g, ' ').trim()];
            }
        }
        console.log(`Streets data loaded into memory`);
    }

    findByPostalCode(postalCodeNumber: string): string[] {
        const findStreets = this.dbStreets[postalCodeNumber];
        return findStreets ? this.dbStreets[postalCodeNumber] : [];
    }

    findByLetters(postalCodeNumber: string, letters: string): string[] {
        const streets = this.dbStreets[postalCodeNumber];
        return !streets ? [] : streets.filter(street => street.includes(letters));
    }

}
