import { ActivityCode } from 'src/activity-codes/entities/activity-code.entity';
import { PostalCode } from 'src/postal-codes/entities/postal-code.entity';
import { Column, Entity, Index, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'companies' })
@Index('idx_name_postalCode', ['name', 'postal_code'], { unique: true })
export class Company {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column('varchar', { length: 150, nullable: false })
    name: string;

    @Column('varchar', { length: 15, nullable: true })
    cif: string;

    @Column({ default: false })
    ejecutivo: boolean;

    @Column('varchar', { length: 255, nullable: false })
    camara_link: string;

    @ManyToMany(() => ActivityCode, activityCode => activityCode.companies)
    @JoinTable()
    activity_codes: ActivityCode[];

    @Index()
    @Column('varchar', { length: 10, nullable: true })
    information_id: string;

    @Index()
    @Column({ nullable: true })
    lastRetrieveData: Date;

    @ManyToOne(() => PostalCode, postalCode => postalCode.companies)
    postal_code: PostalCode;
}
