import { OriginalBase } from "src/shared/original-entity";
import { Pessoa } from "src/app/pessoa/entities/pesssoa.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { NfeCategoria } from "../nfe-categoria/entities/nfe-categoria.entity";
import { Vendedor } from "src/app/vendedor/entities/vendedor.entity";
import { SituacaoNFe, TipoNfe } from "./nfe.types";
import { Venda } from "src/app/venda/entities/venda.entity";


@Entity({name: 'nfe'})
export class Nfe extends OriginalBase {
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @Column({name: 'data_emissao', type: 'timestamp', nullable: true})
    dataEmissao: Date;
    @Column({name: 'data_operacao', type: 'timestamp', nullable: true})
    dataOperacao: Date;
    @Column({name: 'tipo', type: 'int2'})
    tipo: TipoNfe;
    @Column({name: 'situacao', type: 'int2'})
    situacao: SituacaoNFe;
    @ManyToOne((type) => Pessoa, (pessoa) => pessoa.id, { eager: true })
    @JoinColumn({ name: 'id_pessoa', referencedColumnName: 'id' })
    pessoa: Pessoa;
    @ManyToOne((type) => NfeCategoria, nfeCategoria => nfeCategoria.id, {eager: true})
    @JoinColumn({name: 'id_nfe_categoria', referencedColumnName: 'id'})
    nfeCategoria: NfeCategoria;
    @ManyToOne(()=> Vendedor, vendedor => vendedor.id, {eager: true})
    @JoinColumn({name: 'id_vendedor', referencedColumnName: 'id'})
    vendedor: Vendedor;
    @ManyToOne(()=> Venda, venda => venda.id, {eager: true})
    @JoinColumn({name: 'id_venda', referencedColumnName: 'id'})
    venda: Venda;
    @Column({name: 'valor', type: 'numeric', scale: 2, precision: 14})
    valor: number;
    @Column({name: 'chave_acesso', type: 'character varying', length: 44, nullable: true})
    chaveAcesso: string;
    @Column({name: 'serie', type: 'int2', nullable: true})
    serie: number;
    @Column({name: 'xml_link', type: 'text', nullable: true})
    xmlLink: string;
    
}