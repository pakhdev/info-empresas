import { Column, Entity, Index, JoinTable, ManyToMany, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { PostalCodeMode } from "../enums/postal-code-mode.enum";
import { Street } from "src/streets/entities/streets.entity";
import { ActivityCode } from "src/activity-codes/entities/activity-code.entity";
import { Company } from "src/companies/entities/company.entity";
import { PostalCodeDifficultActivityCode } from "./postal-code-difficult-activity-code.entity";
import { PostalCodeCompaniesLoadingEnum } from "../enums/postal-code-companies-loading.enum";

@Entity({ name: 'postal-codes' })
export class PostalCode {

    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column('varchar', { length: 5, nullable: false, unique: true })
    code: string;

    @Column('varchar', { length: 70, nullable: false })
    province: string;

    @Column('varchar', { length: 70, nullable: false })
    city: string;

    @Column({ default: PostalCodeMode.NORMAL })
    mode: PostalCodeMode;

    @OneToMany(() => Street, streets => streets.postal_code)
    streets: Street[];

    @Column({ default: false })
    streetsLoaded: boolean;

    @Index()
    @Column({ default: PostalCodeCompaniesLoadingEnum.NOTSTARTED })
    companiesLoadingState: PostalCodeCompaniesLoadingEnum;

    @Column({ default: false })
    streetsAbsent: boolean;

    @Column({ default: 0 })
    streetsCount: number;

    @Index()
    @Column({ nullable: true })
    lastCompaniesAttemptDate: Date;

    @OneToMany(() => Company, company => company.postal_code)
    companies: Company[];

    @ManyToMany(() => ActivityCode, finishedActivityCodes => finishedActivityCodes.finished_postal_codes)
    @JoinTable()
    finished_activity_codes: ActivityCode[];

    @OneToMany(() => PostalCodeDifficultActivityCode, relation => relation.postalCode)
    difficult_activity_codes: PostalCodeDifficultActivityCode[];
}
