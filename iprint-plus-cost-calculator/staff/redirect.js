'use strict';

const destination = new URL('../', window.location.href);
const source = new URLSearchParams(window.location.search);
source.set('portal', 'staff');
destination.search = source.toString();
window.location.replace(destination);
