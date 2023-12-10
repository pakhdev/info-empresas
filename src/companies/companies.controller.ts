import { Controller, Get, Post, Body, Param } from '@nestjs/common';

import { CompaniesService } from './companies.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyInMemory } from './interfaces/company-in-memory.interface';

@Controller('companies')
export class CompaniesController {
    constructor(private readonly companiesService: CompaniesService) {}

    // Old route was unprocessed
    @Get('one-pending')
    getOnePending(): CompanyInMemory {
        return this.companiesService.getOnePending();
    }

    // Old route was unprocessedwithcif
    @Get('one-pending-with-cif')
    getOnePendingWithCif(): CompanyInMemory {
        return this.companiesService.getOnePendingWithCif();
    }

    // Old route was cifchecked/:id
    @Get('set-cif-checked/:id')
    setCifChecked(@Param('id') id: string): Promise<'ok'> {
        return this.companiesService.setCifChecked(+id);
    }

    @Post(':id')
    update(@Param('id') id: string, @Body() updateCompanyDto: UpdateCompanyDto): Promise<'ok'> {
        return this.companiesService.setInfoId(+id, updateCompanyDto.information_id);
    }

}
