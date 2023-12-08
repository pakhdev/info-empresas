import { Company } from "src/companies/entities/company.entity";
import { PostalCodeDifficultActivityCode } from "src/postal-codes/entities/postal-code-difficult-activity-code.entity";
import { PostalCode } from "src/postal-codes/entities/postal-code.entity";
import { Column, Entity, ManyToMany, OneToMany, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: 'activity-codes'})
export class ActivityCode {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column('varchar', { length: 4, unique: true })
    code: string;

    @ManyToMany(() => Company, company => company.activity_codes)
    companies: Company[];

    @ManyToMany(() => PostalCode, finishedPostalCode => finishedPostalCode.finished_activity_codes)
    finished_postal_codes: PostalCode[];

    @OneToMany(() => PostalCodeDifficultActivityCode, relation => relation.activityCode)
    difficult_postal_codes: PostalCodeDifficultActivityCode[];
}