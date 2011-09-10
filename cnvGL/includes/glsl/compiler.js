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


var glsl = (function() {

	var initialized;

	var parse_state = function() {

		this.scanner = null;
		this.translation_unit = [];
		this.symbols = new glsl.symbol_table();
		this.es_shader = false;
		this.language_version = 0;
		this.version_string = null;
		this.target = null;
		
		this.Const = {
			/* 1.10 */
			MaxLights : 0,
			MaxClipPlanes : 0,
			MaxTextureUnits : 0,
			MaxTextureCoords : 0,
			MaxVertexAttribs : 0,
			MaxVertexUniformComponents : 0,
			MaxVaryingFloats : 0,
			MaxVertexTextureImageUnits : 0,
			MaxCombinedTextureImageUnits : 0,
			MaxTextureImageUnits : 0,
			MaxFragmentUniformComponents : 0,
			
			/* ARB_draw_buffers */
			MaxDrawBuffers : 0,
			
			/**
			* Set of GLSL versions supported by the current context
			*
			* Knowing that version X is supported doesn't mean that versions before
			* X are also supported.  Version 1.00 is only supported in an ES2
			* context or when GL_ARB_ES2_compatibility is supported.  In an OpenGL
			* 3.0 "forward compatible" context, GLSL 1.10 and 1.20 are \b not
			* supported.
			*/
			/*@{*/
			GLSL_100ES : 1,
			GLSL_110 : 2,
			GLSL_120 : 4,
			GLSL_130 : 8
		};


		/**
		* During AST to IR conversion, pointer to current IR function
		*
		* Will be \c NULL whenever the AST to IR conversion is not inside a
		* function definition.
		*/
		this.current_function = null;
		
		/** Have we found a return statement in this function? */
		this.found_return = false;
		
		/** Was there an error during compilation? */
		this.error = false;
		
		/**
		* Are all shader inputs / outputs invariant?
		*
		* This is set when the 'STDGL invariant(all)' pragma is used.
		*/
		this.all_invariant = false;
		
		/** Loop or switch statement containing the current instructions. */
		this.loop_or_switch_nesting = null;
		this.loop_or_switch_nesting_ast = null;
		
		this.user_structures = null;
		this.num_user_structures = 0;
		this.info_log = null;

		/** Shaders containing built-in functions that are used for linking. */
		this.builtins_to_link = new Array(16);
		this.num_builtines_to_link = 0;
	};

	var token;
	function next_token(yylval, yylloc, scanner) {
		lexer.yylval = {};
		var result = lexer.lex();
		if (result == 1) {
			result = 0; //YYEOF	
		}
		yylval[0] = lexer.yylval;
		yylloc[0] = lexer.yylloc;
		return result;
	}

	/*IF DEBUG
	function print_token_value(yyoutput, yytoknum, yyvaluep) {
		glsl.fprintf(2, JSON.stringify(yyvaluep).replace(/"/g, ''));
	}
	*/

	function print_error(yylloc, state, error) {
		glsl.errors.push(error + " at line " + yylloc.first_line + " column " + yylloc.first_column);
	}

	function initialize_types(state) {
		var i, symbols, entry;
		
		var genType = ['float', 'vec2', 'vec3', 'vec4'];

		symbols = {
			variables : {
				'gl_Position' : { type : 'vec4' },
				'gl_FragColor' : { type : 'vec4' },
				'gl_FragDepth' : { type : 'float' },
			},
			functions : {
				'dot' : { type : 'float' },
				'max' : { type : 'float' },
				'texture2D' : { type : 'vec4' }
			}
		};

		//later, check compiler mode (shader vs fragment) when initializing types

		for (i in symbols.variables) {
			entry = state.symbols.add_variable(i);
			entry.type = symbols.variables[i].type;
		}

		for (i in symbols.functions) {
			entry = state.symbols.add_function(i);
			entry.type = symbols.functions[i].type;
		}
	}

	var state = null;

	var glsl = {

		output : null,
		status : false,
		errors : [],

		mode : 0,

		//expose to lexer/parser
		state : null,
		token : token,
		parseError : function(str, hash) {
			yyerror(lexer.yylloc, state, str);
		},

		initialize : function() {

			state = new parse_state();
			this.state = state;
			state.es_shader = true;
			state.language_version = 110;

			//lexer
			this.lexer.yy = this;
			state.scanner = this.lexer;

			//parser
			this.parser.yy = this;

			this.parser.yylex = next_token;
			this.parser.yyerror = print_error;
			/*IF DEBUG
			this.parser.YYPRINT = print_token_value;
			*/
			this.parser.initialize_types = initialize_types;

			this.token = this.parser.yytokentype;
		},
 
		compile : function(source, mode) {

			if (!initialized) {
				this.initialize();
			}

			this.output = null;
			this.status = false;
			this.errors = [];
			this.mode = (typeof mode != 'undefined') ? mode : this.mode;

			var parse_tree = null;

			//preprocess
			this.preprocessor.preprocess(source);
			this.errors.concat(this.preprocessor.errors);
			if (!this.preprocessor.status) {
				return false;
			}

			//parse
			lexer.setInput(this.preprocessor.output);
			parse_tree = this.parser.yyparse(state);
			//need to get errors here
			if (parse_tree != 0) {
				return false;
			}

			//generate
			this.generator.createObjectCode(this.state);
			this.errors.concat(this.generator.errors);
			if (!this.generator.status) {
				return false;	
			}

			this.output = new GlslObject();
			this.output.object_code = this.generator.output;
			this.output.symbol_table = this.state.symbols;
			this.output.mode = this.mode;

			this.status = true;
			return true;
		}
	};
	
	return glsl;
}());

