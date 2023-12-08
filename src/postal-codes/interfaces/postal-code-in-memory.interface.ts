import { ActivityCode } from '../activity-codes/entities/activity-code.entity';
import { PostalCodeCompaniesLoadingEnum } from './enums/postal-code-companies-loading.enum';
import { PostalCodeDifficultActivityCode } from './entities/postal-code-difficult-activity-code.entity';

export interface PostalCodeInMemory {
    id: number;
    code: string;
    finished: ActivityCode[];
    difficult: PostalCodeDifficultActivityCode[];
    touchTime: Date;
    state: PostalCodeCompaniesLoadingEnum;
}