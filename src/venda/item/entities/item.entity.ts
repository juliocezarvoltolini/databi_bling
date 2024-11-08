import { Venda } from "src/venda/entities/venda.entity";
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { EstadoItem } from "./item.types";
import { Produto } from "src/produto/entities/produto.entity";

@Entity({name: 'venda_item'})
@Index(['venda'])
export class Item {
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @CreateDateColumn({type: 'timestamp', name: 'data', nullable: false})
    data: Date;
    @Column({name: 'situacao', type: 'char', length: 1, default: 'A', nullable: false})
    estado: EstadoItem;
    @JoinColumn({name: 'id_venda', referencedColumnName: 'id'})
    @ManyToOne(() => Venda)
    venda: number;
    @JoinColumn({name: 'id_produto', referencedColumnName: 'id'})
    @ManyToOne(() => Produto)
    produto: number;
    @Column({name: 'quantidade', type: 'numeric', precision: 14, scale: 4})
    quantidade: number;
    @Column({name: 'valor', type: 'numeric', precision: 14, scale: 6})
    valor: number;
    @Column({ name: 'desconto_valor', type: 'numeric', precision: 14, scale: 6 })
    desconto_valor: number;
    @Column({ name: 'desconto_percentual', type: 'numeric', precision: 11, scale: 10 })
    desconto_percentual: number;
    @Column({ name: 'total', type: 'numeric', precision: 14, scale: 2 })
    total: number;  

    
}