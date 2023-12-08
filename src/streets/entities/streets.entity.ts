import { PostalCode } from "src/postal-codes/entities/postal-code.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: 'streets' })
export class Street {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column('varchar', { length: 70, nullable: false })
    name: string;

    @ManyToOne(() => PostalCode, postalCode => postalCode.streets)
    @JoinColumn({ name: 'postal-code_id' })
    postal_code: PostalCode;
}
