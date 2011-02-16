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
	var day = d.getFullYear()+'-'+exports.pad(d.getMonth()+1)+'-'+exports.pad(d.getDate())+' '+exports.pad(d.getHours())+':'+exports.pad(d.getMinutes())+':'+exports.pad(d.getSeconds())+'.'+d.getMilliseconds();
	console.log(day+'  '+msg);
};

exports.pad = function(number) {
	var n = String(number);
	
	if (number < 10){
		return '0' + n;
	}
	else{
		return n;
	}
};