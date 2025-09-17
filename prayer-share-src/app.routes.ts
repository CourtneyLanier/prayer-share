import { Routes } from '@angular/router';
import { CardGridContainerComponent } from './features/cards/card-grid-container/card-grid-container.component';

export const routes: Routes = [
  { path: '', component: CardGridContainerComponent },
  { path: '**', redirectTo: '' }
];
