import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../environments/environment';
import { Observable } from 'rxjs';

@Injectable({
	providedIn: 'root'
})
export class UtilsService {

	uri = '';

	constructor(private http: HttpClient, private router: Router) {
		if (environment.production) {
			this.uri = '/api';
		} else {
			this.uri = 'http://localhost:8080/api';
		}
	}

	getEnv(): Observable<HttpResponse<any>> {
		return this.http.get(`${this.uri}/getEnv`, { observe: 'response' });
	}
}
