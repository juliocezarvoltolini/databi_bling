import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";
import { TipoPagamento } from "./forma-pagamento.types";

@Entity({ name: 'forma_pagamento' })
export class FormaPagamento {
    @PrimaryGeneratedColumn({ type: 'int4' })
    id: number;
    @Column({ name: 'nome', type: 'varchar', length: 100, unique: true })
    nome: string;
    @Column({ name: 'tipo_pagamento', type: 'int2', nullable: false })
    tipoPagamento: TipoPagamento
    @Column({ name: 'situacao', type: 'int2', default: 1, nullable: false })
    situacao: Situacao;
}