import { Pessoa } from "src/app/pessoa/entities/pesssoa.entity";
import { Column, Entity, JoinColumn, ManyToOne, OneToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('fornecedor')
export class Fornecedor {
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @JoinColumn({name: 'id_pessoa', referencedColumnName: 'id'})
    @OneToOne(type => Pessoa)
    pessoa: Pessoa;
    @Column({name: 'situacao', type: 'int2', default: 1, nullable: false})
    situacao: Situacao;

}