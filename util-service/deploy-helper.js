const process = require( 'process' );
const fs = require('fs').promises;

const argv = key => {
  // Return true if the key exists and a value is defined
  if ( process.argv.includes( `--${ key }` ) ) return true;

  const value = process.argv.find( element => element.startsWith( `--${ key }=` ) );

  // Return null if the key does not exist and a value is not defined
  if ( !value ) return null;
  
  return value.replace( `--${ key }=` , '' );
}


if (argv('action') == 'deploy_marva_stage'){

	// get the config

	//update the vue config with the deploy path
	let doit = async function(){

		let config = await fs.readFile('/app/util_config.json', 'utf8')
		config = JSON.parse(config);

		const data = await fs.readFile('/tmp/staging-deploy/bfe2test/vue.config.js', 'utf8');
		const result = data.replace(/<REPLACE>/g, config['stageDeployPath']);
		await fs.writeFile('/tmp/staging-deploy/bfe2test/vue.config.js', result,'utf8');

		const dataCss = await fs.readFile('/tmp/staging-deploy/bfe2test/src/assets/main.css', 'utf8');
		const result = dataCss.replace(/<REPLACE>/g, config['prodDeployPath']);
		await fs.writeFile('/tmp/staging-deploy/bfe2test/src/assets/main.css', result,'utf8');



	}

	doit()

}

if (argv('action') == 'deploy_marva_prod'){

	// get the config

	//update the vue config with the deploy path
	let doit = async function(){

		let config = await fs.readFile('/app/util_config.json', 'utf8')
		config = JSON.parse(config);

		const data = await fs.readFile('/tmp/production-deploy/bfe2test/vue.config.js', 'utf8');
		const result = data.replace(/<REPLACE>/g, config['prodDeployPath']);
		await fs.writeFile('/tmp/production-deploy/bfe2test/vue.config.js', result,'utf8');

		const dataCss = await fs.readFile('/tmp/production-deploy/bfe2test/src/assets/main.css', 'utf8');
		const result = dataCss.replace(/<REPLACE>/g, config['prodDeployPath']);
		await fs.writeFile('/tmp/production-deploy/bfe2test/src/assets/main.css', result,'utf8');





	}

	doit()

}