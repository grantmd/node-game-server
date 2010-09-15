exports.copy = function(data){
	var ret = {};
	for (var i in data){
		if (typeof data[i] == 'object'){
			ret[i] = exports.copy(data[i]);
		}
		else{
			ret[i] = data[i];
		}
	}
	
	return ret;
};