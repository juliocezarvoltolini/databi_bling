import { Column } from "typeorm";

export abstract class OriginalBase {
    @Column({name: 'id_original', type: 'varchar', length: '50', nullable: true, unique: true})
    idOriginal: string;
}