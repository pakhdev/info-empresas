import { Type } from "class-transformer";
import { IsArray, IsNumberString, IsString, Length, ValidateNested } from "class-validator";

export class ImportCompaniesDto {
    @IsNumberString()
    @Length(5, 5)
    postal_code: string;

    @IsNumberString()
    @Length(4, 4)
    activity_code: string;

    @IsString()
    search_text: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ImportCompany)
    companies: ImportCompany[];
}

export class ImportCompany {
    @IsString()
    name: string;

    @IsString()
    camara_link: string;
}