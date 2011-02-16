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

exports.log = function(msg){
	var d = new Date();
	var day = d.getFullYear()+'-'+exports.pad(d.getMonth()+1)+'-'+exports.pad(d.getDate())+' '+exports.pad(d.getHours())+':'+exports.pad(d.getMinutes())+':'+exports.pad(d.getSeconds())+'.'+exports.pad(d.getMilliseconds(), 3);
	console.log(day+'  '+msg);
};

exports.pad = function(number, places){
	if (!places) places = 2;
	
	var n = String(number);
	
	if (places == 3 && number < 100){
		if (number < 10){
			return '00' + n;
		}
		else{
			return '0' + n;
		}
	}
	else if (places == 2 && number < 10){
		return '0' + n;
	}
	else{
		return n;
	}
};