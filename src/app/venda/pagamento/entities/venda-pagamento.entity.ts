
import { FormaPagamento } from "src/app/forma-pagamento/entities/forma-pagamento.entity";
import { Venda } from "src/app/venda/entities/venda.entity";
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity({name: 'venda_pagamento'})
@Index(['venda'])
export class VendaPagamento {
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @JoinColumn({name: 'id_venda', referencedColumnName: 'id'})
    @ManyToOne(() => Venda, venda => venda.id, {onDelete: "CASCADE"})
    venda: Venda;
    @Column({name: 'parcela', type: 'varchar', length: 7, nullable: true})
    parcela: string;
    @Column({name: 'observacao', type: 'varchar', length: 200})
    observacao: string;
    @Column({name: 'data_emissao', type: 'timestamp', nullable: true})
    dataEmissao: Date;
    @Column({name: 'data_vencimento', type: 'timestamp', nullable: true})
    dataVencimento: Date;
    @JoinColumn({name: 'id_forma_pagamento', referencedColumnName: 'id'})
    @ManyToOne(() => FormaPagamento, {eager: true})
    formaPagamento: FormaPagamento;
    @Column({name: 'valor', type: 'numeric', precision: 14, scale: 2})
    valor: number;
    @Column({name: 'id_original', type: 'varchar', length: 50, unique: true})
    idOriginal: string;
    
}