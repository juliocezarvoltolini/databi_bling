import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Formato } from "./produto.types";
import { Fornecedor } from "src/fornecedor/entities/fornecedor.entity";
import { ProdutoCategoriaOpcao, ProdutoCategoriaRelacao } from "./produto-categoria.entity";

@Entity('produto')
export class Produto {
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @Column({name: 'descricao', type: 'varchar', nullable: false, length: 200})
    descricao: string;
    @Column({name: 'descricao_curta', type: 'text', nullable: true})
    descricaoCurta: string;
    @Column({name: 'situacao', type: 'int2', default: 1, nullable: false})
    situacao: Situacao;
    @Column({name: 'formato', type: 'char', length: 1, nullable: false, default: 'S'})
    formato: Formato;
    @Column({name: 'gtin', type: 'varchar', length: 14, nullable: true})
    gtin: string;
    @Column({name: 'gtin_embalagem', type: 'varchar', length: 14, nullable: true})
    gtinEmbalagem: string;
    @Column({name: 'observacoes', type: 'text'})
    observacoes: string;
    @JoinColumn({name: 'id_fornecedor', referencedColumnName: 'id'})
    @ManyToOne(() => Fornecedor)
    fornecedor: Fornecedor;
    @JoinColumn({name: 'id_produto_pai', referencedColumnName: 'id'})
    @ManyToOne(() => Produto)
    produtoPai: Produto;
    @Column({name: 'url_imagem', type: 'text', nullable: true})
    urlImagem: string;
    @Column({name: 'valor_preco', type: 'numeric', scale: 6, precision: 14})
    valorPreco: number;
    @Column({name: 'valor_custo', type: 'numeric', scale: 6, precision: 14})
    valorCusto: number;
    @Column({name: 'id_original', type: 'varchar', length: 50, unique: true})
    idOriginal: string;
    @OneToMany(() => ProdutoCategoriaRelacao, rel => rel.produto, { cascade: true, eager: true })
    categoriasOpcao: ProdutoCategoriaRelacao[];
    @Column({name: 'identificador', type: 'varchar', length: 50, nullable: true})
    identificador: string;
}