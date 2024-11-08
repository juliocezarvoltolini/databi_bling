import { ChildEntity, Column, Entity, OneToMany, PrimaryGeneratedColumn, TableInheritance } from "typeorm";
import { PessoaEndereco } from "./pessoa-endereco.entity";



@Entity('pessoa')
export class Pessoa {
    @PrimaryGeneratedColumn({ type: 'int8' })
    id: number;

    @Column({ type: 'char', name: 'tipo_pessoa', length: 1 })
    tipoPessoa: TipoPessoa;

    @Column({ name: "nome", type: "varchar", length: 200, nullable: false })
    nome: string;

    @Column({ name: "numero_documento", type: "varchar", length: 14, unique: true, nullable: true })
    numeroDocumento: string; // CPF ou CNPJ

    @Column({ type: 'varchar', length: 150, nullable: true})
    fantasia: string;

    @Column({ name: 'indicador_inscricao_estadual', type: 'int2', default: 9 })
    indicadorInscricaoEstadual: IndicadorInscricaoEstadual;

    @Column({ name: 'inscricao_estadual', type: 'varchar', length: 30, nullable: true })
    inscricaoEstadual: string;

    @Column({ name: 'rg', type: 'varchar', length: 30, unique: true, nullable: true })
    rg: string;

    @Column({name: 'orgao_emissor', type: 'varchar', length: 30, nullable: true})
    orgaoEmissor: string;

    @Column({name: 'email', type: 'varchar', length: 100, nullable: true})
    email: string;

    @Column({name: 'situacao', type: 'int2', default: 1, nullable: false})
    situacao: Situacao;

    @Column({ type: 'date', nullable: true })
    dataNascimento: Date;

    @Column({ type: 'varchar', length: 1, nullable: true})
    sexo: Sexo;

    @Column({nullable: true})
    naturalidade: string;

    @Column({ type: 'date', nullable: true })
    dataFundacao: Date;

    @OneToMany(() => PessoaEndereco, endereco => endereco.pessoa, { cascade: true })
    enderecos: PessoaEndereco[];

}

