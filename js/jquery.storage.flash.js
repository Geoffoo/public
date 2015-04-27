
var flash_cache = { };
var flash_flagged = { };

/* 
 * Remove an entry from the session and return its value. Cache result in
 * the instance cache.
 */
function flash_get( key ) {
	var storage = $.localStorage;
	var msg = storage.get( 'flash_values_' + key );
	if ( msg ) {
		flash_cache['key'] = msg;
	}
	storage.remove( 'flash_values_' + key );
	return msg;
}

/* Store the entry in the session, updating the instance cache as well. */
function flash_set( key, msg ) {
	var storage = $.localStorage;
	storage.set( 'flash_values_' + key, msg );
	flash_cache[key] = msg;
	return msg;
}

function flash_flag() {
	flash_flagged = { };

	var storage = $.localStorage;
	var i, flash_key;
	var keys = storage.keys();
	/* flag all values keys */
	for (i = 0; i < keys.length; i++) {
		flash_key = keys[i].match( /^flash_values_(.+)$/ );
		if ( flash_key ) {
			flash_flagged[flash_key[2]] = true;
		}
	}
}

function flash_sweep() {
	var storage = $.localStorage;
	var key;
	for (key in flash_flagged) {
		storage.remove( 'flash_values_' + key );
	}
	flash_flagged = { };
}

function flash_messages() {
	flash_flag();
	$.each( ['notice', 'alert', 'error'], function( i, key ) {
		var msg = flash_get( key );
		if ( msg ) {
			$( '#flash-' + key ).text( msg );
		}
	});
	flash_sweep();
}

/* set cache and re-display message */
function flash_now( key, msg ) {
  flash_cache[key] = msg;
  $( '#flash-' + key ).text( msg );
}


