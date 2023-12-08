import { ActivityCode } from '../../activity-codes/entities/activity-code.entity';

export interface CompanyInMemory {
    id?: number;
    name: string;
    cif?: string;
    postal_code?: string;
    activity_code?: string;
    activity_codes?: ActivityCode[];
    camara_link?: string;
}