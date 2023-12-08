import { IsNumberString, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateCompanyDto {
    @IsNumberString()
    @MaxLength(10)
    @MinLength(1)
    information_id: string;
}
