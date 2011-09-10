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

(function(glsl) {

	//-------------------------------------------------
	//	Code Generation Options/Data
	//-------------------------------------------------

	//Type qualifier global variables
	var g_type_qualifiers = [];
	g_type_qualifiers[glsl.ast.type_qualifier.flags.attribute] = 'attribute';
	g_type_qualifiers[glsl.ast.type_qualifier.flags.uniform] = 'uniform';
	g_type_qualifiers[glsl.ast.type_qualifier.flags.out] = 'out';
	g_type_qualifiers[glsl.ast.type_qualifier.flags.varying] = 'varying';
	function g_type_default_value(type) {
		switch (type.type_specifier) {
			case glsl.ast.types.float:
				return '0.0';
			case glsl.ast.types.vec2:
				return '[0,0]';
			case glsl.ast.types.vec3:
				return '[0,0,0]';
			case glsl.ast.types.vec4:
				return '[0,0,0,0]';
			case glsl.ast.types.mat4:
				return '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]';
			case glsl.ast.types.sampler2d:
				return 'null';
			default:
				throw new Error(g_error('Cannot generate default value for type ' + type.type_name, type));
		}
	}

	//table for valid type operations
	var g_valid_type_operations = {};
	var g_operations_types = {
		'cons' : {
			vec2 : { type : 'vec2', func : 'vec.construct(2,%s)' },
			vec3 : { type : 'vec3', func : 'vec.construct(3,%s)' },
			vec4 : { type : 'vec4', func : 'vec.construct(4,%s)' }
		},
		5 : { //glsl.ast.operators.mul
			mat4 : {
				mat4 : { type : 'mat4', func : 'mat4.multiply(%s,%s,[])' },
				vec4 : { type : 'vec4', func : 'mat4.multiplyVec4(%s,%s,[])' }
			},
			vec3 : {
				float : { type : 'vec3', func : 'vec3.multipleScalar(%s,%s,[])' }
			}
		},
		41 : { //glsl.ast.operators.function_call
			'*' : { type : 'null', func : '%s(%s)' }
		}
	};

	function g_get_operation(op, type1, type2) {
		op = g_operations_types[op];
		if (op[type1] && !type2) {
			return op[type1];
		}
		if (op[type1] && op[type1][type2]) {
			return op[type1][type2];
		}
		if (op['*'] && !type2) {
			return op['*'];
		}		
		if (op['*'] && op['*'][type2]) {
			return op['*'][type2];
		}
		if (op['*'] && op['*']['*']) {
			return op['*']['*'];
		}
		return false;
	}

	var g_operations_field_selection_names = {
		vec2 : [ 'xy', 'rg', 'st' ],
		vec3 : [ 'xyz', 'rgb', 'stp' ],
		vec4 : [ 'xyzw', 'rgba', 'stpq' ]
	};

	function g_get_field_selection_r_type(identifier, fields, type) {
		var i, sets, set, exp, j, keys;
		fields = fields.split('');

		//invalid number of field selections
		if (fields.length < 1 || fields.length > 4) {
			return false;
		}

		//find a field set based on the first field
		sets = g_operations_field_selection_names[type];
		for (i in sets) {
			if (sets[i].indexOf(fields[0]) != -1) {
				set = sets[i];
				break;
			}
		}
		if (!set) {
			return false;
		}

		keys = [];
		for (i = 0; i < fields.length; i++) {
			j = set.indexOf(fields[i]);
			if (j == -1) {
				return false;	
			}
			keys[i] = glsl.sprintf('%s[%s]', identifier, j);
		}

		exp = {};
		if (keys.length == 1) {
			exp.type = 'float';
			exp.code = keys[0];
		} else {
			exp.type = 'vec' + keys.length;
			exp.code = glsl.sprintf("[%s]", keys.join(","));
		}

		return exp;
	}

	function g_indent() {
		return new Array(glsl.generator.depth + 1).join("\t");
	}

	//-------------------------------------------------
	//	Code Generation
	//-------------------------------------------------

	function g_ast_type_specifier(ts) {
		if (ts.is_precision_statement) {
			return "\n";	
		}
		throw new Error(g_error('Cannot generate type specifier', ts));
	}

	function g_ast_declarator_list(dl) {
		var code, type, specifier, list, d_code, i, decl, name, entry, exp, i_code;

		code = '';

		//get default initialization values
		type = dl.type;
		specifier = type.specifier;
		d_code = g_type_default_value(specifier);
		if (!d_code) {
			return false;
		}

		list = dl.declarations;
		for (i = 0; i < list.length; i++) {
			decl = list[i];
			name = decl.identifier;

			//add symbol table entry
			entry = glsl.state.symbols.add_variable(name);
			entry.type = specifier.type_name;

			if (dl.type.qualifier) {
				entry.qualifier_name = g_type_qualifiers[type.qualifier.flags.q];
				//code += entry.object_name + " = " + d_code + ";\n";
				code += "\n";
			} else {
				if (decl.initializer) {
					exp = g_ast_expression(decl.initializer);
					if (exp.type != entry.type) {
						throw new Error(g_error("Could not assign value of type " + exp.type + " to " + entry.type, dl));
					}
					i_code = exp.code;
				} else {
					i_code = d_code;
				}
				code += "var " + entry.name + " = " + i_code + ";\n";
			}
		}
		return code;
	}

	function g_ast_function(f) {
		var code = '', p_code = '', i;

		var name = f.identifier;
		var entry = glsl.state.symbols.get_function(name);

		var parameters = f.parameters;

		var params = [];
		for (i = 0; i < parameters.length; i++) {
			var param = parameters[i];
			if (param.is_void) {
				return '';
			}
			params.push(param.identifier);
		}
		p_code = params.join(", ");

		code = "function " + entry.object_name + "(" + p_code + ")";

		return code;
	}

	function g_ast_expression_op(e) {

		var exp = {};
		var se = e.subexpressions;
		if (se) {
			var se1 = se[0], se2 = se[1], se3 = se[2];
		}

		var left, right, third;
		//ast_expression una/bin/tri

		if (se1) {
			left = g_ast_expression(se1);
		}

		if (se2) {
			right = g_ast_expression(se2);
		}

		if (se3) {
			third = g_ast_expression(se3);
		}

		switch (e.oper) {

			case glsl.ast.operators.int_constant:
			case glsl.ast.operators.identifier:
				exp = g_ast_expression_simple(e);
				return exp;

			case glsl.ast.operators.assign:

				if (left.type != right.type) {
					throw new Error(g_error("Could not assign value of type " + right.type + " to " + left.type, e));
				}

				//@todo:
				//check that left is a valid type for assignment
				//if left has a quantifier, generate that

				exp.type = left.type;
				exp.code = left.code + " = " + right.code;
				return exp;

			//case glsl.ast.operators.*
			case glsl.ast.operators.mul:
				var op = g_get_operation(e.oper, left.type, right.type);
				if (!(exp.type = op.type)) {
					throw new Error(g_error("Cannot apply operation to " + left.type + " and " + right.type, e));
				}
				exp.code = glsl.sprintf(op.func, left.code, right.code);				
				return exp;

			case glsl.ast.operators.function_call:
				var es = [], i;

				for (i = 0; i < e.expressions.length; i++) {
					es.push(g_ast_expression(e.expressions[i]).code);
				}

				//todo: check types of parameters

				if (e.cons) {
					op = g_get_operation('cons', left.type);
					exp.type = op.type;
					exp.code = glsl.sprintf(op.func, es.join(','));
					return exp;
				} else {
					op = g_get_operation(e.oper, left.type);
					var entry = glsl.state.symbols.get_variable(se1.primary_expression.identifier);
					exp.type = entry.type;
					exp.code = glsl.sprintf(op.func, left.code, es.join(','));
					return exp;					
				}
				
				throw new Error(g_error("Could not translate function call", e));

			case glsl.ast.operators.field_selection:
				exp = g_get_field_selection_r_type(left.code, e.primary_expression.identifier, left.type);
				if (exp) {
					return exp;
				} else {
					throw new Error(g_error("Invalid field selection " + left.code + "." + e.primary_expression.identifier, e));					
				}

			default:
				throw new Error(g_error("Could not translate unknown expression " + e.typeOf() + '(' + e.oper + ')', e));
		}
	}

	function g_ast_expression_simple(e) {
		var exp = {};

		//identifier
		if (e.primary_expression.identifier) {

			var identifier = e.primary_expression.identifier;
			//lookup type in symbol table
			var entry = glsl.state.symbols.get_variable(identifier);

			if (!entry || !entry.type) {
				throw new Error(g_error(e.primary_expression.identifier + " is undefined", e));
			}

			if (entry.depth == 0) {
				exp.code = entry.object_name;
			} else {
				exp.code = identifier;	
			}
			exp.type = entry.type;

			return exp;
		}
		
		if (typeof e.primary_expression.float_constant != 'undefined') {
			exp.code = e.primary_expression.float_constant;
			exp.type = 'float';
			return exp;
		}

		if (typeof e.primary_expression.int_constant != 'undefined') {
			exp.code = e.primary_expression.int_constant;
			exp.type = 'int';
			return exp;
		}

		throw new Error(g_error("Cannot translate unkown simple expression type", e));
	}

	function g_ast_expression(e) {

		var exp = {};

		//operator
		if (typeof e.oper == 'number') {
			exp = g_ast_expression_op(e);
			return exp;
		}

		//simple (variable, or value)
		if (e.primary_expression) {
			exp = g_ast_expression_simple(e);
			return exp;
		}

		//cast
		if (e.typeOf('ast_type_specifier')) {
			exp.type = e.type_name;
			return exp;
		}

		throw new Error(g_error("Could not translate unknown expression type", e));
	}

	function g_ast_expression_statement(es) {
		var exp = g_ast_expression(es.expression);
		if (exp.code) {
			exp.code += ";\n";
		}
		return exp.code;
	}

	function g_ast_compound_statement(cs) {
		var code, i, stmts, start, node, stmt, exp, es;

		glsl.state.symbols.push_scope();

		code = '';
		stmts = cs.statements;
		start = stmts.head;

		glsl.generator.depth++;

		while (node != start) {
			if (!node) {
				node = start;
			}
			stmt = node.data;
			switch (stmt.typeOf()) {
				case 'ast_expression_statement':
					es = g_ast_expression_statement(stmt);
					if (!es) {
						return false;
					}
					code += g_indent() + es;
					break;
				case 'ast_declarator_list':
					exp = g_ast_declarator_list(stmt);
					if (exp) {
						code += exp;
					}
					break;
				default:
					throw new Error(g_error("Could not translate statement type (" + stmt.typeOf() + ")", stmt));
			}

			node = node.next;
		}

		glsl.state.symbols.pop_scope();

		glsl.generator.depth--;
		code = g_indent() + "{\n" + code + g_indent() + "}\n";
		return code;
	}

	function g_ast_function_definition(fd) {
		var code = '', p_code = '', b_code = '';

		if (fd.is_definition) {
			//just need to add to symbol table
			return "\n";
		}

		p_code = g_ast_function(fd.proto_type);
		b_code = g_ast_compound_statement(fd.body);
		if (!b_code) {
			return false;	
		}

		code = p_code + "\n" + b_code;
		return code;
	}

	function g_translation_unit(tu) {
		var t = tu.typeOf();
		switch (t) {
			case 'ast_declarator_list':
				return g_ast_declarator_list(tu);
			case 'ast_type_specifier':
				return g_ast_type_specifier(tu);
			case 'ast_function_definition':
				return g_ast_function_definition(tu);
			default:
				throw new Error(g_error('Cannot translate syntax tree node (' + d.typeOf() + ')'  , tu));
		}
	}

	function g_error(msg, n) {
		if (n && n.location) {
			msg += " at line " + n.location.line + ", column " + n.location.column;	
		}
		return msg;
	}
	
	//-----------------------------------------------------------
	//External interface

	glsl.generator = {
		
		depth : 0,

		output : '',
		status : false,
		errors : [],

		createObjectCode : function(state) {
			var i;
			//initialize
			this.output = '';
			this.status = false;
			this.errors = [];

			try {
				for (i = 0; i < state.translation_unit.length; i++) {
					var tu = state.translation_unit[i];
					this.output += g_translation_unit(tu);
				}
			} catch (e) {
				this.errors.push(e);
				throw e;
				//return false;
			}

			this.status = true;
			return true;
		}		
	};

}(glsl));

