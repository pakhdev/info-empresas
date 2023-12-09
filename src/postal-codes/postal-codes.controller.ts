import { Controller, Get, Post, Body } from '@nestjs/common';
import { BehaviorSubject, filter, mergeMap, take } from 'rxjs';

import { PostalCodesService } from './postal-codes.service';
import { ImportCompaniesDto } from './dto/import-companies.dto';

@Controller('postal-codes')
export class PostalCodesController {
    constructor(private readonly postalCodesService: PostalCodesService) {}

    processPostalCodes$ = new BehaviorSubject<boolean>(false);

    // Identifies and returns missing postal codes within a specified range,
    // based on the existing postal codes stored in the database.
    @Get('missing-codes')
    findMissingPostalCodes(): Promise<string[]> {
        return this.postalCodesService.findMissingPostalCodes();
    }

    @Get('unprocessed-companies')
    async getTasks() {
        // Проверяем, выполняется ли уже процесс
        if (this.processPostalCodes$.value) {
            return this.processPostalCodes$.pipe(
                filter(() => !this.processPostalCodes$.value),
                take(1),
                mergeMap(() => this.getTasks()),
            );
        }

        this.processPostalCodes$.next(true); // lock
        const unprocessedPostalCode = await this.postalCodesService.getTasks();
        this.processPostalCodes$.next(false); // unlock
        return unprocessedPostalCode;
    }

    @Post('insert-companies')
    insertCompanies(@Body() importCompaniesDto: ImportCompaniesDto) {
        return this.postalCodesService.insertCompanies(importCompaniesDto);
    }

    @Post('spawn-street-number-tasks')
    spawnStreetNumberTasks(@Body() generateDto: {
        postalCodeNumber: string,
        streetName: string,
        minNumber: string,
        maxNumber: string
    }) {
        return this.postalCodesService.spawnStreetNumberTasks(generateDto.postalCodeNumber, generateDto.streetName, generateDto.minNumber, generateDto.maxNumber);
    }

    @Post('spawn-street-number-tasks')
    spawnKeywordTasks(@Body() generateDto: {
        postalCodeNumber: string,
        keyword: string
    }) {
        return this.postalCodesService.spawnKeywordTasks(generateDto.postalCodeNumber, generateDto.keyword);
    }

}
