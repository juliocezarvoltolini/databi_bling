import { Between, ColumnType, DeepPartial, EntityMetadata, Equal, FindOptionsWhere, ILike, Repository } from "typeorm";
import { Assigned } from "../util/object/object.util";


export function AssignEntityFromParams<T>(params: []): T {
    const entity = {};

    for (const key in params) {
        if (!key.startsWith('odr_')) {
            entity[key] = params[key]
        }

    }
    return entity as T
}


export function BuildFindOptionsFromModel<T>(entity: DeepPartial<T>, entityMetadata: EntityMetadata) {
    let findOptions = {};
    const stringType: ColumnType[] = ["string", "char varying", "character varying", "char", "character"];
    const dateType: ColumnType[] = ["date", "datetime", "timestamp", "timestamptz", "time"];

    entityMetadata.columns.forEach(column => {
        const propertyName = column.propertyName;
        const propertyValue = entity?.[propertyName]; //ESTA PROPRIEDADE PODE SER NULL OR UNDEFINED
        const propertyType = column.type;

        if (Assigned(propertyValue)) {
            if (Assigned(column.referencedColumn))
                findOptions[propertyName] = BuildFindOptionsFromModel<T>(propertyValue, column.referencedColumn.entityMetadata)
            else {
                if (stringType.includes(propertyType)) { //string
                    findOptions[propertyName] = ILike(propertyValue);
                } else if (dateType.includes(propertyType)) { //date
                    findOptions[propertyName] = Equal(propertyValue);
                } else if (Assigned(propertyValue["inicio"]) && Assigned(propertyValue["fim"])) { //between date
                    findOptions = Between(propertyValue["inicio"], propertyValue["fim"]);
                } else {
                    findOptions[propertyName] = Equal(propertyValue);
                }

            }
        }


    })
    return findOptions;
}