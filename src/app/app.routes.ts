import { Routes } from '@angular/router';
import { CardGridContainerComponent } from './features/cards/card-grid-container/card-grid-container.component';
import { ImportWizardComponent } from './features/import/import-wizard/import-wizard.component';

export const routes: Routes = [
  { path: '', component: CardGridContainerComponent },
  { path: 'import', component: ImportWizardComponent },
  { path: '**', redirectTo: '' }
];
