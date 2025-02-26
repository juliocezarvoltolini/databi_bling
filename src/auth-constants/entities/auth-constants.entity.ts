import { Empresa } from "src/app/empresa/entities/empresa.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity({name: 'auth_constants'})
export class AuthConstants {
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @Column({name: 'nome', type: 'varchar', length: 50, nullable: false})
    nome: string;
    @ManyToOne(() => Empresa)
    @JoinColumn({name: 'id_empresa', referencedColumnName: 'id'})
    empresa: Empresa;
    @Column({name: 'valor', type: 'text', nullable: false})
    valor: string;
    @Column({name: 'expira', type: 'timestamptz', nullable: true})
    expira: Date;
}