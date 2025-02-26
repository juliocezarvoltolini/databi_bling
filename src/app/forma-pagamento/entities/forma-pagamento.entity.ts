import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";
import { BandeiraCartao, Finalidade, TipoPagamento } from "./forma-pagamento.types";

@Entity({ name: 'forma_pagamento' })
export class FormaPagamento {
    @PrimaryGeneratedColumn({ type: 'int4' })
    id: number;
    @Column({ name: 'nome', type: 'varchar', length: 100, unique: true })
    nome: string;
    @Column({ name: 'tipo_pagamento', type: 'int2', nullable: false })
    tipoPagamento: TipoPagamento
    @Column({ name: 'finalidade', type: 'int2', nullable: false })
    finalidade: Finalidade;
    @Column({ name: 'situacao', type: 'int2', default: 1, nullable: false })
    situacao: Situacao;
    @Column({ name: 'taxa_aliquota', type: 'numeric', precision: 8, scale: 4, default: 0.00})
    taxaAliquota: number;
    @Column({ name: 'taxa_valor', type: 'numeric', precision: 14, scale: 4, default: 0.00})
    taxaValor: number;
    @Column({ name: 'bandeira_cartao', type: 'int2', nullable: true })
    bandeiraCartao: BandeiraCartao;
    @Column({name: 'id_original', type: 'varchar', length: 50, unique: true})
    idOriginal: string;
}