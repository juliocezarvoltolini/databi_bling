import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Vendedor } from "./vendedor.entity";

@Entity({name: 'vendedor_comissao'})
export class VendedorComissao {
    @PrimaryGeneratedColumn({type: 'int4' })
    id: number;
    @JoinColumn({name: 'id_vendedor', referencedColumnName: 'id'})
    @ManyToOne(() => Vendedor, vendedor => vendedor.id, { onDelete: 'CASCADE' })
    vendedor: Vendedor;
    @Column({name: 'percentual_desconto', type: 'numeric', scale: 2, precision:5})
    percentualDesconto: number;
    @Column({name: 'percentual_desconto', type: 'numeric', scale: 2, precision:5})
    percentualComissao: number;
}