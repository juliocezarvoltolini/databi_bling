import { Empresa } from "src/empresa/entities/empresa.entity";
import { Pessoa } from "src/pessoa/entities/pesssoa.entity";
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { VendaEstado } from "./venda.types";
import { Vendedor } from "src/vendedor/entities/vendedor.entity";

@Entity({ name: 'venda' })
@Index(['dataEmissao', 'estado'])
export class Venda {
    @PrimaryGeneratedColumn({ type: 'int4' })
    id: number;
    @ManyToOne(() => Empresa)
    @JoinColumn({ name: 'id_empresa', referencedColumnName: 'id' })
    empresa: Empresa;
    @Column({name: 'estado', type: 'char', length: 1, nullable: false})
    estado: VendaEstado;
    @CreateDateColumn({ name: 'data_emissao', type: 'timestamp', nullable: false })
    dataEmissao: Date;
    @Column({ name: 'data_saida', type: 'timestamp', nullable: true })
    dataSaida: Date;
    @ManyToOne(() => Pessoa)
    @JoinColumn({ name: 'id_pessoa', referencedColumnName: 'id' })
    pessoa: Pessoa;
    @JoinColumn({name: 'id_vendedor', referencedColumnName: 'id'})
    @ManyToOne(() => Vendedor)
    vendedor: number
    @Column({ name: 'subtotal', type: 'numeric', precision: 14, scale: 2 })
    subtotal: number;
    @Column({ name: 'desconto_valor', type: 'numeric', precision: 14, scale: 6 })
    desconto_valor: number;
    @Column({ name: 'desconto_percentual', type: 'numeric', precision: 14, scale: 10 })
    desconto_percentual: number;
    @Column({ name: 'total', type: 'numeric', precision: 14, scale: 2 })
    total: number;

}