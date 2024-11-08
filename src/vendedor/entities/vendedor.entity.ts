import { Pessoa } from "src/pessoa/entities/pesssoa.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity({name: 'vendedor'})
export class Vendedor {
    
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @JoinColumn({name: 'id_pessoa', referencedColumnName: 'id'})
    @ManyToOne(type => Pessoa)
    pessoa: Pessoa;
    @Column({name: 'situacao', type: 'int2'})
    situacao: Situacao;
    

}