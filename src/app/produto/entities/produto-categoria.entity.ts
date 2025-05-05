import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ProdutoCategoriaTipo } from './produto.types';

@Entity({ name: 'produto_categoria' })
export class ProdutoCategoria {
  @PrimaryGeneratedColumn({ type: 'int4' })
  id: number;
  @Column({ name: 'nome', type: 'varchar', length: 100 })
  nome: string;
  @Column({ name: 'tipo', type: 'char', length: 1, default: 'C', nullable: false })
  tipo: ProdutoCategoriaTipo;
  @OneToMany(() => ProdutoCategoriaOpcao, (opcao) => opcao.produtoCategoria)
  opcoes: ProdutoCategoriaOpcao[];
}

@Entity({ name: 'produto_categoria_opcao' })
export class ProdutoCategoriaOpcao {
  @PrimaryGeneratedColumn({ type: 'int4' })
  id: number;
  @ManyToOne(() => ProdutoCategoria, { eager: true, cascade: true })
  @JoinColumn({ name: 'id_produto_categoria' })
  produtoCategoria: ProdutoCategoria;
  @Column({ name: 'nome', type: 'varchar', length: 100 })
  nome: string;
}
