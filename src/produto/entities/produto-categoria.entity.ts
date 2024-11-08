import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Produto } from "./produto.entity";
import { ProdutoCategoriaTipo } from "./produto.types";

@Entity({name: 'produto_categoria'})
export class ProdutoCategoria {
    @PrimaryGeneratedColumn({type:  'int4'})
    id: number;
    @Column({name: 'nome', type: 'varchar', length: 100})
    nome: string;
    @Column({name: 'tipo', type: 'char', length: 1, default: 'C', nullable: false})
    tipo: ProdutoCategoriaTipo;
}

@Entity({name: 'produto_categoria_opcao'})
export class ProdutoCategoriaOpcao {
    @PrimaryGeneratedColumn({type:  'int4'})
    id: number;
    @ManyToOne(() => ProdutoCategoria, {eager: true})
    @JoinColumn({name: 'id_produto_categoria'})
    produtoCategoria: ProdutoCategoria;
    @Column({name: 'nome', type: 'varchar', length: 100})
    nome: string;
}

@Entity({name: 'produto_categoria_relacao'})
export class ProdutoCategoriaRelacao {
    @PrimaryGeneratedColumn({type:  'int4'})
    id: number;
    @ManyToOne(() => Produto, {eager: true})
    @JoinColumn({name: 'id_produto', referencedColumnName: 'id'})
    produto: Produto;
    @ManyToOne(() => ProdutoCategoriaOpcao, {eager: true})
    @JoinColumn({name: 'id_produto_categoria_opcao', referencedColumnName: 'id'})
    produtoCategoriaOpcao: ProdutoCategoriaOpcao;
}