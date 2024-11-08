import { Observable } from "rxjs";
import { DeepPartial, ObjectLiteral } from "typeorm";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { ResponsePage } from "../page/response-page-interface";
import { IPageRequest } from "../page/request-page-interface";

export interface IService<A> {
    create(entityDTO: DeepPartial<A | A[]>): Observable<A | A[]>

    pagedSearch(pageRquest: IPageRequest<A>): Observable<ResponsePage<A>>

    find(entity: DeepPartial<A>): Observable<A[]>

    findOne(id: any): Observable<A>;

    update(id: any, entityDTO: QueryDeepPartialEntity<A>): Observable<A>;

}