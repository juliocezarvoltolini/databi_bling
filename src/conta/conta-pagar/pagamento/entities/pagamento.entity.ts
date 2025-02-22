import { Column, Entity, JoinColumn, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { ContaPagar } from "../../entities/conta-pagar.entity";
import { Portador } from "src/conta/portador/entities/portador.entity";

@Entity({ name: 'pagamento' })
export class Pagamento {
    @PrimaryGeneratedColumn({ type: 'integer' })
    id: number;
    @ManyToOne((type) => ContaPagar, (contaPagar) => contaPagar.id)
    @JoinColumn({ name: 'id_conta_pagar', referencedColumnName: 'id' })
    contaPagar: ContaPagar;
    @Column({ name: 'data_pagamento', type: 'date', nullable: false })
    dataPagamento: Date;
    @ManyToOne((type) => Portador, portador => portador.id, { eager: true })
    @JoinColumn({name: 'id_portador', referencedColumnName: 'id'})
    portador: Portador;
    @Column({ name: 'valor', type: 'numeric', precision: 14, scale: 2 })
    valor: number;

}