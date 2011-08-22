/*
Copyright (c) 2011 Cimaron Shanahan

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/


function glDrawArrays(mode, first, count) {

	var state, renderer, program;
	var a, i, j, k;

	state = cnvgl_context.getCurrentContext();
	renderer = state.renderer;
	program = state.current_program;

	//var buffer = state.bound_buffers[GL_ARRAY_BUFFER];
	//var buffer_object = cnvgl_objects[buffer];
	//var data = buffer_object.data;

	//gather vertex attributes

	var vtas = state.vertex_attrib_arrays;

	var active_attrs = [], attr_buffers = [];
	var prgm_attr, prgm_attr_loc;

	for (a = 0; a < program.active_attributes_count; a++) {
		
		prgm_attr = program.active_attributes[a];
		prgm_attr_loc = prgm_attr.location;
		
		active_attrs[prgm_attr_loc] = vtas[a];
		if (vtas[a].buffer_obj) {
			attr_buffers[prgm_attr_loc] = vtas[a].buffer_obj.data;
		}
	}


	//generate primitive/vertices
	var prim = new cnvgl_primitive();
	prim.mode = mode;

	var vertex, attr_data, vtx_attr_data, attr;

	var start, stride, size;

	//each vertex
	for (i = first; i < count; i++) {

		vertex = new cnvgl_vertex();
		prim.vertices.push(vertex);

		//build attribute set and initialize
		for (j = 0; j < active_attrs.length; j++) {

			//no buffer data was specified for this attribute
			if (!(attr_data = attr_buffers[j])) {
				continue;
			}

			attr = active_attrs[j];

			vtx_attr_data = [];
			vertex.attributes[j] = vtx_attr_data;

			stride = attr.stride;
			size = attr.size;
			start = attr.pointer + (i * size + stride);

			//can replace the following with TypedArray view
			for (k = 0; k < size; k++) {
				vtx_attr_data[k] = attr_data[k + start];
			}
		}
	}

	renderer.send(prim);
}
