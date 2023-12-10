import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { PostalCode } from './postal-code.entity';
import { ActivityCode } from 'src/activity-codes/entities/activity-code.entity';

@Entity({ name: 'postal_codes_difficult_activity_codes' })
@Index('idx_text_activity_postal', ['searchText', 'postalCode', 'activityCode'], { unique: true })
export class PostalCodeDifficultActivityCode {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ type: 'varchar', length: 100, collation: 'utf8mb4_bin', charset: 'utf8mb4' })
    searchText: string;

    @Column({ default: 0 })
    difficulty: number;

    @Index()
    @ManyToOne(() => PostalCode, postalCode => postalCode.difficult_activity_codes)
    @JoinColumn({ name: 'postalCodeId' })
    postalCode: PostalCode;

    @ManyToOne(() => ActivityCode, activityCode => activityCode.difficult_postal_codes)
    activityCode: ActivityCode;
}
