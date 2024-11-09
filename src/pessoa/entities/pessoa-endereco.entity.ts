import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Pessoa } from "./pesssoa.entity";
import { IUF } from "src/common/types/uf.types";

@Entity({name: 'pessoa_endereco'})
export class PessoaEndereco {
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @JoinColumn({name: 'id_pessoa', referencedColumnName: 'id'})
    @ManyToOne(() => Pessoa, pessoa => pessoa.enderecos)
    pessoa: Pessoa;
    @Column({name: 'cep', type: 'varchar', length: '8'})
    cep: string;
    @Column({name: 'bairro', type: 'varchar', length: 50})
    bairro: string;
    @Column({name: 'municipio', type: 'varchar', length: 150})
    municipio: string;
    @Column({name: 'uf', type: 'char', length: 2})
    uf: IUF;
    @Column({name: 'numero', type: 'varchar', length: 10})
    numero: string;
    @Column({name: 'complemento', type: 'varchar', length: 200})
    complemento: string;

  
} 