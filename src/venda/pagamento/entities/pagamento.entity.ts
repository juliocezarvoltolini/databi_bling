import { FormaPagamento } from "src/forma-pagamento/entities/forma-pagamento.entity";
import { Venda } from "src/venda/entities/venda.entity";
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity({name: 'venda_pagamento'})
@Index(['venda'])
export class Pagamento {
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @JoinColumn({name: 'id_venda', referencedColumnName: 'id'})
    @ManyToOne(() => Venda)
    venda: Venda;
    @Column({name: 'parcela', type: 'varchar', length: 7})
    parcela: string;
    @Column({name: 'data_emissao', type: 'timestamp', nullable: false})
    dataEmissao: Date;
    @Column({name: 'data_vencimento', type: 'timestamp', nullable: false})
    dataVencimento: Date;
    @JoinColumn({name: 'id_forma_pagamento', referencedColumnName: 'id'})
    @ManyToOne(() => FormaPagamento)
    formaPagamento: FormaPagamento;
    @Column({name: 'valor', type: 'numeric', precision: 14, scale: 2})
    valor: number;
    
}