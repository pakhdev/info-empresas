import { IsNumberString, Length } from 'class-validator';

export class CreateActivityCodeDto {
    @IsNumberString()
    @Length(3, 4)
    code: string;
}
