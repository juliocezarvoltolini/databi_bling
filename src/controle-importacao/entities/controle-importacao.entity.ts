import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({name: 'controle_importacao'})
export class ControleImportacao {
    @PrimaryGeneratedColumn({type: 'int4'})
    id: number;
    @Column({name: 'tabela', type: 'varchar', length: 100, unique: true})
    tabela: string;
    @Column({name: 'pagina', type: 'int4'})
    pagina: number;
}