import { IsArray, IsNotEmpty, IsObject, IsString } from "class-validator";
import { ActivityCode } from "src/activity-codes/entities/activity-code.entity";
import { PostalCode } from "src/postal-codes/entities/postal-code.entity";

export class CreateCompanyDto {

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    camara_link: string;

    @IsString()
    @IsNotEmpty()
    activity_code: string;

    @IsObject()
    postal_code: PostalCode;

    @IsArray()
    activity_codes: ActivityCode[];
}
