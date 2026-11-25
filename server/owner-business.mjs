/** Private runtime module. Never copy server code or connection keys into public assets. */
import ProviderOffers from '../dist/provider-offers.js';
export {handleOwnerConsole, authorizeConsoleOwner, handleSupport} from './owner-console.mjs';
export {publicOwnerContent, ownerContentSitemap} from './owner-content.mjs';
export const ownerOfferPolicy={normalize:ProviderOffers.normalize,offerState:ProviderOffers.offerState};
export {handleOperatorSnapshot} from './operator-snapshot.mjs';
export {handleOwnerSitemap} from './owner-public-sitemap.mjs';
