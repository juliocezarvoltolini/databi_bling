import { Pessoa } from "src/pessoa/entities/pesssoa.entity";
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { VendedorComissao } from "./vendedor-comissao.entity";

@Entity({name: 'vendedor'})
export class Vendedor {
    
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @JoinColumn({name: 'id_pessoa', referencedColumnName: 'id'})
    @ManyToOne(type => Pessoa)
    pessoa: Pessoa;
    @Column({name: 'situacao', type: 'int2'})
    situacao: Situacao;
    @Column({name: 'id_original', type: 'varchar', length: 50})
    idOriginal: string;
    @OneToMany(() => VendedorComissao, comissao => comissao.vendedor, {cascade: true, eager: true})
    comissao: VendedorComissao[];  


}