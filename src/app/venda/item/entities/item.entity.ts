import { Venda } from "src/app/venda/entities/venda.entity";
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { EstadoItem } from "./item.types";
import { Produto } from "src/app/produto/entities/produto.entity";

@Entity({name: 'venda_item'})
@Index(['venda'])
export class Item {
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @CreateDateColumn({type: 'timestamp', name: 'data', nullable: true})
    data: Date;
    @Column({name: 'situacao', type: 'char', length: 1, default: 'A', nullable: false})
    estado: EstadoItem;
    @JoinColumn({name: 'id_venda', referencedColumnName: 'id'})
    @ManyToOne(() => Venda, venda => venda.id, {onDelete: 'CASCADE'})
    venda: Venda;
    @JoinColumn({name: 'id_produto', referencedColumnName: 'id'})
    @ManyToOne(() => Produto)
    produto: Produto;
    @Column({name: 'quantidade', type: 'numeric', precision: 14, scale: 4})
    quantidade: number;
    @Column({name: 'unidade', type: 'varchar', length: 6})
    unidade: string;
    @Column({name: 'valor', type: 'numeric', precision: 14, scale: 6})
    valor: number;
    @Column({ name: 'desconto_valor', type: 'numeric', precision: 14, scale: 6 })
    desconto_valor: number;
    @Column({ name: 'desconto_rateado_valor', type: 'numeric', precision: 14, scale: 6, default: 0.00 })
    desconto_rateado_valor: number; //QUANDO LANÇA DESCONTO SOBRE A VENDA, ELE É RATEADO NESSA COLUNA
    @Column({ name: 'desconto_percentual', type: 'numeric', precision: 14, scale: 10 })
    desconto_percentual: number;
    @Column({ name: 'total', type: 'numeric', precision: 14, scale: 2 })
    total: number;  
    @Column({name: 'id_original', type: 'varchar', length: 50, unique: true})
    idOriginal: string;
    @Column({name: 'identificador', type: 'varchar', length: 50, nullable: true})
    identificador: string;
    

    
}