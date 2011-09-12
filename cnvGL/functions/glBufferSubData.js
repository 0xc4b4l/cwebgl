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


function glBufferSubData(target, offset, size, data) {
	var ctx, buffer_obj, temp, i;

	ctx = cnvgl_context.getCurrentContext();

	switch (target) {
		case GL_ARRAY_BUFFER:
			buffer_obj = ctx.array.arrayBufferObj;
			break;
		case GL_ELEMENT_ARRAY_BUFFER:
			bufer_obj = ctx.array.elementArrayBufferObj;
			break;
		default:
			cnvgl_throw_error(GL_INVALID_ENUM);
			return;
	}
	
	if (!buffer_obj) {
		cnvgl_throw_error(GL_INVALID_OPERATION);
		return;
	}

	if (offset < 0 || size < 0 || offset + size > buffer_obj.size) {
		cnvgl_throw_error(GL_INVALID_VALUE);
		return;
	}

	//probably need to add check for source type
	for (i = offset; i < offset + size; i++) {
		buffer_obj.data[i] = data[i];	
	}
}
