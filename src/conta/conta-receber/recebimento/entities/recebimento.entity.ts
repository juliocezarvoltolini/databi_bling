import { Column, Entity, JoinColumn, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ContaReceber } from "../../entities/conta-receber.entity";
import { Portador } from "src/conta/portador/entities/portador.entity";

@Entity({ name: 'recebimento' })
export class Recebimento {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;
    @ManyToOne((type) => ContaReceber, (contaPagar) => contaPagar.id)
    @JoinColumn({ name: 'id_conta_receber', referencedColumnName: 'id' })
    contaReceber: ContaReceber;
    @Column({ name: 'data_pagamento', type: 'date', nullable: false })
    dataPagamento: Date;
    @ManyToOne((type) => Portador, portador => portador.id, { eager: true })
    @JoinColumn({name: 'id_portador', referencedColumnName: 'id'})
    portador: Portador;
    @Column({ name: 'valor', type: 'numeric', precision: 14, scale: 2 })
    valor: number;

}