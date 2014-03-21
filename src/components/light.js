//***** LIGHT ***************************

/**
* Light that contains the info about the camera
* @class Light
* @constructor
* @param {Object} object to configure from
*/

function Light(o)
{
	/**
	* Position of the light
	* @property position
	* @type {[[x,y,z]]}
	* @default [0,0,0]
	*/
	this.position = vec3.create();
	/**
	* Position where the light is pointing at (target)
	* @property target
	* @type {[[x,y,z]]}
	* @default [0,0,1]
	*/
	this.target = vec3.fromValues(0,0,1);
	/**
	* Up vector
	* @property up
	* @type {[[x,y,z]]}
	* @default [0,1,0]
	*/
	this.up = vec3.fromValues(0,1,0);

	/**
	* Enabled
	* @property enabled
	* @type {Boolean}
	* @default true
	*/
	this.enabled = true;

	/**
	* Near distance
	* @property near
	* @type {Number}
	* @default 1
	*/
	this.near = 1;
	/**
	* Far distance
	* @property far
	* @type {Number}
	* @default 1000
	*/

	this.far = 1000;
	/**
	* Angle for the spot light inner apperture
	* @property angle
	* @type {Number}
	* @default 45
	*/
	this.angle = 45; //spot cone
	/**
	* Angle for the spot light outer apperture
	* @property angle_end
	* @type {Number}
	* @default 60
	*/
	this.angle_end = 60; //spot cone end

	this.use_diffuse = true;
	this.use_specular = true;
	this.linear_attenuation = false;
	this.range_attenuation = false;
	this.att_start = 0;
	this.att_end = 1000;
	this.offset = 0;
	this.spot_cone = true;

	this.target_in_world_coords = false;

	/**
	* The color of the light
	* @property color
	* @type {[[r,g,b]]}
	* @default [1,1,1]
	*/
	this.color = vec3.fromValues(1,1,1);
	/**
	* The intensity of the light
	* @property intensity
	* @type {Number}
	* @default 1
	*/
	this.intensity = 1;

	/**
	* If the light cast shadows
	* @property cast_shadows
	* @type {Boolean}
	* @default false
	*/
	this.cast_shadows = false;
	this.shadow_bias = 0.005;
	this.shadowmap_resolution = 1024;
	this.type = Light.OMNI;
	this.frustum_size = 50; //ortho

	//for caching purposes
	this._macros = {};
	this._uniforms = {};

	if(o) 
	{
		this.configure(o);
		if(o.shadowmap_resolution)
			this.shadowmap_resolution = parseInt(o.shadowmap_resolution); //LEGACY: REMOVE
	}
}

//do not change
Light.FRONT_VECTOR = new Float32Array(0,0,-1); //const
Light.UP_VECTOR = new Float32Array(0,1,0); //const

Light.OMNI = 1;
Light.SPOT = 2;
Light.DIRECTIONAL = 3;

Light.DEFAULT_SHADOWMAP_RESOLUTION = 1024;
Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE = 50;

Light.prototype.onAddedToNode = function(node)
{
	if(!node.light) node.light = this;

	LEvent.bind(node, "collectLights", this.onCollectLights, this );
}

Light.prototype.onRemovedFromNode = function(node)
{
	if(node.light == this) delete node.light;
}

Light.prototype.onCollectLights = function(e, lights)
{
	if(!this.enabled)
		return;

	//projective texture needs the light matrix to compute projection
	if(this.projective_texture || this.cast_shadows)
		this.updateShadowmapCamera();

	//add to lights vector
	lights.push(this);
}

Light._temp_matrix = mat4.create();
Light._temp2_matrix = mat4.create();
Light._temp3_matrix = mat4.create();
Light._temp_position = vec3.create();
Light._temp_target = vec3.create();
Light._temp_up = vec3.create();
Light._temp_front = vec3.create();

Light.prototype.updateShadowmapCamera = function()
{
	if(!this._shadowmap_camera)
		this._shadowmap_camera = new Camera();

	var camera = this._shadowmap_camera;
	camera.eye = this.getPosition(Light._temp_position);
	camera.center = this.getTarget(Light._temp_target);

	var up = this.getUp(Light._temp_up);
	var front = this.getFront(Light._temp_front);
	if( Math.abs( vec3.dot(front,up) ) > 0.999 ) 
		vec3.set(up,0,0,1);
	camera.up = up;

	camera.type = this.type == Light.DIRECTIONAL ? Camera.ORTHOGRAPHIC : Camera.PERSPECTIVE;

	camera._frustum_size = this.frustum_size || Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE;
	camera.near = this.near;
	camera.far = this.far;
	camera.fov = (this.angle_end || 45); //fov is in degrees

	camera.updateMatrices();
	this._light_matrix = camera._viewprojection_matrix;

	/* ALIGN TEXEL OF SHADOWMAP IN DIRECTIONAL
	if(this.type == Light.DIRECTIONAL && this.cast_shadows && this.enabled)
	{
		var shadowmap_resolution = this.shadowmap_resolution || Light.DEFAULT_SHADOWMAP_RESOLUTION;
		var texelSize = frustum_size / shadowmap_resolution;
		view_matrix[12] = Math.floor( view_matrix[12] / texelSize) * texelSize;
		view_matrix[13] = Math.floor( view_matrix[13] / texelSize) * texelSize;
	}
	*/	

	return camera;
}

Light.prototype.getShadowmapCamera = function()
{
	if(!this._shadowmap_camera)
		this.updateShadowmapCamera();
	return this._shadowmap_camera;
}

//parameters are if you want to store the result in different matrices
/*
Light.prototype.computeLightMatrices = function(view_matrix, projection_matrix, viewprojection_matrix)
{
	var position = this.getPosition(Light._temp_position);
	var target = this.getTarget(Light._temp_target);
	var up = this.getUp(Light._temp_up);
	var front = this.getFront(Light._temp_front);

	if( Math.abs( vec3.dot(front,up) ) > 0.999 ) vec3.set(up,0,0,1); //avoid problems when the light comes straight from [0,1,0]

	if(!projection_matrix) projection_matrix = Light._temp_matrix;
	if(!view_matrix) view_matrix = Light._temp2_matrix;
	if(!viewprojection_matrix) viewprojection_matrix = Light._temp3_matrix;

	var frustum_size = this.frustum_size || Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE;
	if(this.type == Light.DIRECTIONAL)
		mat4.ortho(projection_matrix, frustum_size*-0.5, frustum_size*0.5, frustum_size*-0.5, frustum_size*0.5, this.near, this.far);
	else
		mat4.perspective(projection_matrix, (this.angle_end || 45) * DEG2RAD, 1, this.near, this.far);

	mat4.lookAt(view_matrix, position, target, up );

	//adjust subpixel shadow movements to avoid flickering
	if(this.type == Light.DIRECTIONAL && this.cast_shadows && this.enabled)
	{
		var shadowmap_resolution = this.shadowmap_resolution || Light.DEFAULT_SHADOWMAP_RESOLUTION;
		var texelSize = frustum_size / shadowmap_resolution;
		view_matrix[12] = Math.floor( view_matrix[12] / texelSize) * texelSize;
		view_matrix[13] = Math.floor( view_matrix[13] / texelSize) * texelSize;
	}
	mat4.multiply(viewprojection_matrix, projection_matrix, view_matrix);

	//save it
	if( !this._lightMatrix ) this._lightMatrix = mat4.create();
	mat4.copy( this._lightMatrix, viewprojection_matrix );
}
*/

Light.prototype.serialize = function()
{
	this.position = vec3.toArray(this.position);
	this.target = vec3.toArray(this.target);
	this.color = vec3.toArray(this.color);
	return cloneObject(this);
}

Light.prototype.configure = function(o)
{
	LS.cloneObject(o,this);
}

Light.prototype.getPosition = function(p)
{
	//if(this._root && this._root.transform) return this._root.transform.transformPointGlobal(this.position, p || vec3.create() );
	if(this._root && this._root.transform) return this._root.transform.getGlobalPosition();
	return vec3.clone(this.position);
}

Light.prototype.getTarget = function(p)
{
	//if(this._root && this._root.transform && !this.target_in_world_coords) 
	//	return this._root.transform.transformPointGlobal(this.target, p || vec3.create() );
	if(this._root && this._root.transform && !this.target_in_world_coords) 
		return this._root.transform.transformPointGlobal( Light.FRONT_VECTOR , p || vec3.create() );
	return vec3.clone(this.target);
}

Light.prototype.getUp = function(p)
{
	if(this._root && this._root.transform) return this._root.transform.transformVector( Light.UP_VECTOR , p || vec3.create() );
	return vec3.clone(this.up);
}

Light.prototype.getFront = function(p) {
	var front = p || vec3.create();
	vec3.subtract(front, this.getPosition(), this.getTarget() ); //front is reversed?
	//vec3.subtract(front, this.getTarget(), this.getPosition() ); //front is reversed?
	vec3.normalize(front, front);
	return front;
}

Light.prototype.getResources = function (res)
{
	if(this.projective_texture)
		res[ this.projective_texture ] = Texture;
	return res;
}

LS.registerComponent(Light);
LS.Light = Light;